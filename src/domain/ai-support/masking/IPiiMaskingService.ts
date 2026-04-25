import type { MaskingResult } from './MaskingResult';

export interface KnownPiiSet {
  recipientName: string;
  recipientNameAliases?: string[];
  familyMembers?: Array<{ name: string; relation: string }>;
  phones?: string[];
  addresses?: string[];
  postalCodes?: string[];
  birthDate?: string;
}

export interface IPiiMaskingService {
  mask(text: string, knownPiis: KnownPiiSet): Promise<MaskingResult>;
}
