// The `@types/safe-compare` package does not declare a module and that breaks
// the type checker...
declare module 'safe-compare' {
  function safeCompare(a: string, b: string): boolean;

  export default safeCompare;
}
