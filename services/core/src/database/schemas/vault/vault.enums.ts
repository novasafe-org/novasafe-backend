export enum VaultItemCategory {
  Login = 'login',
  Note = 'note',
  Card = 'card',
  Identity = 'identity',
  Api = 'api',
}

export enum VaultSyncStatus {
  Synced = 'synced',
  Pending = 'pending',
  Conflict = 'conflict',
}

export enum CustomFieldType {
  Text = 'TEXT',
  Password = 'PASSWORD',
  Pin = 'PIN',
  Otp = 'OTP',
  Totp = 'TOTP',
  SecurityQuestion = 'SECURITY_QUESTION',
  Email = 'EMAIL',
  Phone = 'PHONE',
  Username = 'USERNAME',
  Url = 'URL',
  Address = 'ADDRESS',
  CardNumber = 'CARD_NUMBER',
  CardHolderName = 'CARD_HOLDER_NAME',
  ExpiryDate = 'EXPIRY_DATE',
  Cvv = 'CVV',
  UpiId = 'UPI_ID',
  BankAccountNumber = 'BANK_ACCOUNT_NUMBER',
  IfscCode = 'IFSC_CODE',
  CompanyName = 'COMPANY_NAME',
  EmployeeId = 'EMPLOYEE_ID',
  LicenseNumber = 'LICENSE_NUMBER',
  PassportNumber = 'PASSPORT_NUMBER',
  AadharNumber = 'AADHAR_NUMBER',
  PanNumber = 'PAN_NUMBER',
  NoteField = 'NOTE',
  Date = 'DATE',
  Number = 'NUMBER',
  File = 'FILE',
  Select = 'SELECT',
  Boolean = 'BOOLEAN',
  Tags = 'TAGS',
}

export enum PasswordStrength {
  Weak = 'weak',
  Medium = 'medium',
  Strong = 'strong',
}
