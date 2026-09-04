export interface FormatMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface FormatMenuGroup {
  items: FormatMenuItem[];
}
