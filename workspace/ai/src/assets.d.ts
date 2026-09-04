// Bun text imports (e.g. `import text from "../system-prompt.md" with { type: "text" }`)
declare module "*.md" {
  const text: string;
  export default text;
}
