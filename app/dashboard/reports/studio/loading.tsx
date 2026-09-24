// /dashboard/reports/studio/[reportId] only redirects, to the Studio editor,
// so while it resolves it shows the editor's skeleton rather than the Reports
// one it would otherwise inherit.
export { default } from '../../studio/edit/[reportId]/loading'
