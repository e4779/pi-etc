declare module 'diff' {
  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: { context?: number }
  ): string;

  export function diffLines(
    oldStr: string,
    newStr: string,
    options?: { context?: number }
  ): { oldLines: string[]; newLines: string[]; removed: number[]; added: number[] }[];
}
