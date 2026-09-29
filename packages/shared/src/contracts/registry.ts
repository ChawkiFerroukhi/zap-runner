import type { FieldMap } from '../template/fields.js';

export type ConfigFieldKind = 'text' | 'template' | 'multiline-template' | 'repository' | 'boolean';

export interface ConfigField {
  key: string;
  label: string;
  kind: ConfigFieldKind;
  required: boolean;
  default?: string | boolean;
  placeholder?: string;
  help?: string;
}

export interface OutputField {
  key: string;
  label: string;
}

export interface AppDescriptor {
  id: string;
  name: string;
  description: string;
  runnable: boolean;
}

export interface TriggerDescriptor {
  id: string;
  appId: string;
  name: string;
  description: string;
  configFields: ConfigField[];
  outputFields: OutputField[];
  sample: FieldMap;
}

export interface ActionDescriptor {
  id: string;
  appId: string;
  name: string;
  description: string;
  configFields: ConfigField[];
}

export interface RegistryResponse {
  apps: AppDescriptor[];
  triggers: TriggerDescriptor[];
  actions: ActionDescriptor[];
}

export interface RepositoryOption {
  fullName: string;
  private: boolean;
}
