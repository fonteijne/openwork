// Template files are imported as text (`with { type: "text" }`; bun bundles them).
declare module "*.md" {
  const content: string;
  export default content;
}
declare module "*.txt" {
  const content: string;
  export default content;
}
declare module "*/LICENSE" {
  const content: string;
  export default content;
}
