// Letter template types for credit repair letter generation

export type LetterType = 
  | 'VALIDATION_REQUEST'
  | 'DISPUTE_INACCURATE'
  | 'GOODWILL_ADJUSTMENT'
  | 'PAY_FOR_DELETE'
  | 'CEASE_DESIST';

export interface LetterTemplate {
  id: LetterType;
  name: string;
  description: string;
  category: 'BUREAU' | 'FURNISHER' | 'COLLECTOR' | 'CREDITOR';
  target: 'BUREAU' | 'FURNISHER';
  requiresAccount: boolean;
  allowsMultipleAccounts: boolean;
  defaultBureaus: ('EQUIFAX' | 'EXPERIAN' | 'TRANSUNION')[];
}

export interface ClientData {
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  ssnLast4?: string;
  dob?: string;
}

export interface FurnisherData {
  name: string;
  address?: string;
  type: 'CREDITOR' | 'COLLECTOR' | 'BUREAU';
}

export interface AccountData {
  id: string;
  furnisher: string;
  accountNumber?: string;
  accountType: string;
  balance?: number;
  dateAdded?: string;
  reason: string;
  customInstruction?: string;
}

export interface LetterData {
  letterType: LetterType;
  client: ClientData;
  accounts: AccountData[];
  bureaus: ('EQUIFAX' | 'EXPERIAN' | 'TRANSUNION')[];
  customNotes?: string;
  includeDisclosure?: boolean;
}

export interface GeneratedLetter {
  id: string;
  letterType: LetterType;
  subject: string;
  content: string;
  htmlContent: string;
  bureaus: string[];
  accountCount: number;
  generatedAt: string;
  estimatedPages: number;
}

export interface LetterTemplateConfig {
  header: string;
  footer: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export const DEFAULT_LETTER_CONFIG: LetterTemplateConfig = {
  header: '',
  footer: 'CredX Credit Repair Services',
  fontFamily: 'Arial, sans-serif',
  fontSize: 12,
  lineHeight: 1.6,
  margins: {
    top: 72,    // 1 inch
    right: 72,
    bottom: 72,
    left: 72
  }
};
