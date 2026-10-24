export interface FilterOption { label: string; hex?: string; categories: string[]; }
export interface SpecFilterGroup { specName: string; values: string[]; }
export interface OptionFilterGroup {
  groupName: string;
  categories: string[]; // ProductType[]; the admin restriction of the group, empty = all
  values: FilterOption[];
}
export interface DynamicFilters {
  optionFilters: OptionFilterGroup[];
  specFilters: SpecFilterGroup[];
}
