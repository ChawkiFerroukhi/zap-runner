import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { FormControl } from '@angular/forms';
import { FormRecord, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  resolveTemplate,
  templateReferences,
  type ConfigField,
  type ConfigValues,
  type FieldMap,
  type RepositoryOption,
  type TriggerSample,
  type ZapDto,
  type ZapInput,
} from '@zap-runner/shared';
import { map } from 'rxjs';
import { toApiError } from '../../core/api-error';
import { readCopilotHandoff } from '../../core/copilot-handoff';
import { RegistryStore } from '../../core/registry.store';
import { timeAgo } from '../../core/time';
import { ZapsApi } from '../../core/zaps.api';
import { AppPicker } from './app-picker';
import { ConfigFieldControl, type BoundField, type TemplateFocus } from './config-field';

type ConfigControl = FormControl<string | boolean>;

interface PreviewItem {
  key: string;
  label: string;
  output: string;
  missing: string[];
}

type TemplateElement = HTMLInputElement | HTMLTextAreaElement;

function isTemplateKind(field: ConfigField): boolean {
  return field.kind === 'template' || field.kind === 'multiline-template';
}

function initialValue(
  field: ConfigField,
  existing: ConfigValues,
  hints: Record<string, string>,
): string | boolean {
  const current = existing[field.key];
  if (current !== undefined) return current;
  const hint = hints[field.key];
  if (hint !== undefined) return hint;
  if (field.default !== undefined) return field.default;
  return field.kind === 'boolean' ? false : '';
}

@Component({
  selector: 'app-zap-builder-page',
  imports: [ReactiveFormsModule, RouterLink, AppPicker, ConfigFieldControl],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './zap-builder.page.html',
  styleUrl: './zap-builder.page.css',
})
export class ZapBuilderPage {
  private readonly api = inject(ZapsApi);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly store = inject(RegistryStore);

  readonly zapId = input<string>();

  protected readonly form = this.fb.group({
    name: this.fb.control(''),
    triggerApp: this.fb.control('github'),
    triggerType: this.fb.control(''),
    triggerConfig: new FormRecord<ConfigControl>({}),
    actionApp: this.fb.control('github'),
    actionType: this.fb.control(''),
    actionConfig: new FormRecord<ConfigControl>({}),
  });

  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );

  protected readonly copilotExplanation = signal(
    readCopilotHandoff(this.router.currentNavigation()?.extras.state ?? history.state),
  );
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly repositories = signal<RepositoryOption[] | null>(null);
  protected readonly repositoriesError = signal<string | null>(null);
  protected readonly triggerFields = signal<BoundField[]>([]);
  private readonly sample = signal<TriggerSample | null>(null);
  protected readonly actionFields = signal<BoundField[]>([]);

  private focusedTemplate: { key: string; element: TemplateElement } | null = null;
  private boundTriggerId = '';

  protected readonly apps = computed(() => this.store.registry()?.apps ?? []);
  protected readonly editing = computed(() => this.zapId() !== undefined);

  protected readonly triggerOptions = computed(() => {
    const appId = this.value().triggerApp;
    return this.store.registry()?.triggers.filter((trigger) => trigger.appId === appId) ?? [];
  });

  protected readonly actionOptions = computed(() => {
    const appId = this.value().actionApp;
    return this.store.registry()?.actions.filter((action) => action.appId === appId) ?? [];
  });

  protected readonly trigger = computed(() => {
    this.store.registry();
    return this.store.trigger(this.value().triggerType);
  });

  protected readonly action = computed(() => {
    this.store.registry();
    return this.store.action(this.value().actionType);
  });

  protected readonly previewFields = computed<FieldMap>(
    () => this.sample()?.fields ?? this.trigger()?.sample ?? {},
  );

  protected readonly previewSource = computed(() => {
    const sample = this.sample();
    if (sample?.source === 'latest-event' && sample.receivedAt) {
      return `Rendered with your latest real event, received ${timeAgo(sample.receivedAt)}.`;
    }
    return 'Rendered with a built-in sample event until one of your Zaps receives a real one.';
  });

  protected readonly preview = computed<PreviewItem[]>(() => {
    const trigger = this.trigger();
    const action = this.action();
    if (!trigger || !action) return [];
    const config = this.value().actionConfig;
    const fields = this.previewFields();
    return action.configFields.filter(isTemplateKind).map((field) => {
      const raw = config[field.key];
      const result = resolveTemplate(typeof raw === 'string' ? raw : '', fields);
      return { key: field.key, label: field.label, output: result.output, missing: result.missing };
    });
  });

  protected readonly repositoryChoices = computed(() => {
    const options = this.repositories() ?? [];
    const current = this.value().triggerConfig['repository'];
    if (
      typeof current === 'string' &&
      current !== '' &&
      !options.some((o) => o.fullName === current)
    ) {
      return [{ fullName: current, private: false }, ...options];
    }
    return options;
  });

  constructor() {
    this.form.controls.triggerApp.valueChanges.subscribe((appId) => {
      this.selectTrigger(this.store.registry()?.triggers.find((t) => t.appId === appId)?.id ?? '');
    });
    this.form.controls.actionApp.valueChanges.subscribe((appId) => {
      this.selectAction(this.store.registry()?.actions.find((a) => a.appId === appId)?.id ?? '');
    });
    this.form.controls.triggerType.valueChanges.subscribe(() => {
      this.bindTriggerFields({});
      this.remapActionFields();
    });
    this.form.controls.actionType.valueChanges.subscribe(() => {
      this.bindActionFields({});
    });

    effect(() => {
      void this.initialise(this.zapId());
    });
    effect(() => {
      const triggerId = this.value().triggerType;
      if (triggerId !== '') void this.loadSample(triggerId);
    });
    void this.loadRepositories();
  }

  protected errorFor(path: string): string | undefined {
    return this.fieldErrors()[path];
  }

  protected chooseApp(step: 'trigger' | 'action', appId: string): void {
    const control =
      step === 'trigger' ? this.form.controls.triggerApp : this.form.controls.actionApp;
    if (control.value !== appId) control.setValue(appId);
  }

  protected rememberFocus({ key, event }: TemplateFocus): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.focusedTemplate = { key, element: target };
    }
  }

  protected insertField(fieldKey: string): void {
    const token = `{{${fieldKey}}}`;
    const focused = this.focusedTemplate;
    const control = focused ? this.form.controls.actionConfig.controls[focused.key] : undefined;
    if (focused && control) {
      const { element } = focused;
      element.setRangeText(
        token,
        element.selectionStart ?? element.value.length,
        element.selectionEnd ?? element.value.length,
        'end',
      );
      control.setValue(element.value);
      element.focus();
      return;
    }
    const fallback = this.actionFields().find(({ field }) => field.kind === 'multiline-template');
    if (fallback) {
      const current = fallback.control.value;
      fallback.control.setValue(`${typeof current === 'string' ? current : ''}${token}`);
    }
  }

  protected async save(draft: boolean): Promise<void> {
    this.error.set(null);
    this.fieldErrors.set({});
    const value = this.form.getRawValue();
    if (value.name.trim() === '') {
      this.fieldErrors.set({ name: 'Give the Zap a name' });
      return;
    }
    const input: ZapInput = {
      name: value.name,
      draft,
      trigger: { type: value.triggerType, config: value.triggerConfig },
      action: { type: value.actionType, config: value.actionConfig },
    };
    this.saving.set(true);
    try {
      const zapId = this.zapId();
      const saved = zapId ? await this.api.update(zapId, input) : await this.api.create(input);
      await this.router.navigate(['/zaps', saved.id]);
    } catch (error) {
      const detail = toApiError(error);
      this.error.set(detail.message);
      this.fieldErrors.set(detail.fields ?? {});
    } finally {
      this.saving.set(false);
    }
  }

  private async initialise(zapId: string | undefined): Promise<void> {
    try {
      const [zap] = await Promise.all([
        zapId ? this.api.get(zapId) : Promise.resolve(null),
        this.store.load(),
      ]);
      if (zap) this.applyZap(zap);
      else this.applyDefaults();
      this.loaded.set(true);
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }

  private applyDefaults(): void {
    const trigger = this.store.registry()?.triggers[0];
    const action = this.store.registry()?.actions[0];
    this.form.patchValue(
      { triggerApp: trigger?.appId ?? '', actionApp: action?.appId ?? '' },
      { emitEvent: false },
    );
    this.selectTrigger(trigger?.id ?? '');
    this.selectAction(action?.id ?? '');
  }

  private applyZap(zap: ZapDto): void {
    const trigger = this.store.trigger(zap.trigger.type);
    const action = this.store.action(zap.action.type);
    this.form.patchValue(
      {
        name: zap.name,
        triggerApp: trigger?.appId ?? '',
        triggerType: zap.trigger.type,
        actionApp: action?.appId ?? '',
        actionType: zap.action.type,
      },
      { emitEvent: false },
    );
    this.bindTriggerFields(zap.trigger.config);
    this.bindActionFields(zap.action.config);
    this.boundTriggerId = zap.trigger.type;
  }

  private selectTrigger(triggerId: string): void {
    this.form.controls.triggerType.setValue(triggerId, { emitEvent: false });
    this.bindTriggerFields({});
    this.remapActionFields();
  }

  private remapActionFields(): void {
    const previous = this.store.trigger(this.boundTriggerId);
    const next = this.store.trigger(this.form.controls.triggerType.value);
    this.boundTriggerId = next?.id ?? '';
    if (!next) return;
    const available = new Set(next.outputFields.map((field) => field.key));
    for (const { field, control } of this.actionFields()) {
      const hint = next.mappingHints[field.key];
      const current = control.value;
      if (hint === undefined || typeof current !== 'string') continue;
      const untouched =
        current === '' ||
        current === field.default ||
        current === previous?.mappingHints[field.key];
      const broken = templateReferences(current).some((key) => !available.has(key));
      if (untouched || broken) control.setValue(hint);
    }
  }

  private selectAction(actionId: string): void {
    this.form.controls.actionType.setValue(actionId, { emitEvent: false });
    this.bindActionFields({});
  }

  private bindTriggerFields(existing: ConfigValues): void {
    const fields = this.store.trigger(this.form.controls.triggerType.value)?.configFields ?? [];
    this.triggerFields.set(this.bind(this.form.controls.triggerConfig, fields, existing, {}));
  }

  private bindActionFields(existing: ConfigValues): void {
    const fields = this.store.action(this.form.controls.actionType.value)?.configFields ?? [];
    const hints = this.store.trigger(this.form.controls.triggerType.value)?.mappingHints ?? {};
    this.focusedTemplate = null;
    this.actionFields.set(this.bind(this.form.controls.actionConfig, fields, existing, hints));
  }

  private bind(
    record: FormRecord<ConfigControl>,
    fields: ConfigField[],
    existing: ConfigValues,
    hints: Record<string, string>,
  ): BoundField[] {
    for (const key of Object.keys(record.controls)) record.removeControl(key, { emitEvent: false });
    const bound = fields.map((field) => {
      const control = this.fb.control<string | boolean>(initialValue(field, existing, hints));
      record.addControl(field.key, control, { emitEvent: false });
      return { field, control };
    });
    record.updateValueAndValidity();
    return bound;
  }

  private async loadSample(triggerId: string): Promise<void> {
    this.sample.set(null);
    try {
      const sample = await this.api.triggerSample(triggerId);
      if (this.value().triggerType === triggerId) this.sample.set(sample);
    } catch {
      this.sample.set(null);
    }
  }

  private async loadRepositories(): Promise<void> {
    try {
      this.repositories.set(await this.api.repositories());
    } catch (error) {
      this.repositoriesError.set(toApiError(error).message);
      this.repositories.set([]);
    }
  }
}
