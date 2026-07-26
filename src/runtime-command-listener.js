import readline from 'node:readline';

export function listenRuntimeCommands(input, handlers, onError) {
  const lines = readline.createInterface({ input });
  lines.on('line', (line) => {
    try {
      const command = JSON.parse(line);
      handlers[command.type]?.(command);
    } catch (error) {
      onError(error);
    }
  });
  return lines;
}
