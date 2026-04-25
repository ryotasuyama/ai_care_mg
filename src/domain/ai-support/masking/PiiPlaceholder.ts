export type PiiCategory =
  | 'recipient_name'
  | 'family_name'
  | 'phone'
  | 'address'
  | 'postal_code'
  | 'birth_date'
  | 'email'
  | 'facility_name'
  | 'caregiver_name';

export class PiiPlaceholder {
  private constructor(
    public readonly category: PiiCategory,
    public readonly token: string,
    public readonly originalValue: string,
  ) {}

  static create(
    category: PiiCategory,
    originalValue: string,
    sequence: number,
  ): PiiPlaceholder {
    const token = `{${category.toUpperCase()}_${String(sequence).padStart(3, '0')}}`;
    return new PiiPlaceholder(category, token, originalValue);
  }

  /** DB 等の永続層から復元する場合に使う (バリデーションなし) */
  static reconstruct(category: PiiCategory, token: string, originalValue: string): PiiPlaceholder {
    return new PiiPlaceholder(category, token, originalValue);
  }
}
