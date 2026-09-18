// The two slices of `tracking_configs` the Tracking sub-page edits.
//
// They lived in the two form components that used to own them
// (`search-terms-form.tsx`, `settings-form.tsx`); the artboard port replaced
// both with one form (`tracking-form.tsx`) over sections that take plain props,
// so the shapes outlived their files and live here, where the page and the
// action can both name them without importing a component for a type.

export interface SearchTermsConfig {
  brand_keywords: string[] | null
  competitor_keywords: string[] | null
  industry_keywords: string[] | null
  exclude_terms: string[] | null
}

export interface TrackingConfig {
  competitor_names: string[] | null
  report_period: string | null
  report_day: string | null
}
