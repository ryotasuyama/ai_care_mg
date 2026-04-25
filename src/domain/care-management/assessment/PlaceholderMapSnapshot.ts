export interface PlaceholderEntry {
  token: string;
  originalValue: string;
  category: string;
}

export class PlaceholderMapSnapshot {
  private constructor(private readonly entries: ReadonlyArray<PlaceholderEntry>) {}

  static create(entries: PlaceholderEntry[]): PlaceholderMapSnapshot {
    return new PlaceholderMapSnapshot([...entries]);
  }

  unmask(textWithPlaceholders: string): string {
    let result = textWithPlaceholders;
    for (const entry of this.entries) {
      result = result.replaceAll(entry.token, entry.originalValue);
    }
    return result;
  }

  get count(): number {
    return this.entries.length;
  }

  toJSON(): PlaceholderEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }
}
