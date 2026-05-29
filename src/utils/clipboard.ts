export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function copyText(text: string): void {
  copyToClipboard(text).catch(() => { /* clipboard unavailable — silent */ });
}
