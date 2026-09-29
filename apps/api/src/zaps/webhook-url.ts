export function webhookUrlFor(publicUrl: string): (zapId: string) => string {
  return (zapId) => {
    const url = new URL(publicUrl);
    url.searchParams.set('zap', zapId);
    return url.toString();
  };
}
