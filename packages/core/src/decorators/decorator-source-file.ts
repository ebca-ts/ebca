export function captureDecoratorSourceFile(): string | null {
  const stackLines = new Error().stack?.split('\n') ?? [];
  const sourceLine = stackLines.find((line) => {
    const filePath = parseStackFilePath(line);
    return (
      filePath !== null &&
      !filePath.includes('/node_modules/') &&
      !filePath.includes('/libs/ebca-core/src/decorators/')
    );
  });
  return sourceLine ? parseStackFilePath(sourceLine) : null;
}

function parseStackFilePath(line: string): string | null {
  const match = line.match(/\(?((?:file:\/\/)?\/[^():]+):\d+:\d+\)?$/);
  if (!match) {
    return null;
  }
  return match[1].replace(/^file:\/\//, '');
}
