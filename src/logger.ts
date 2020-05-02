export enum LogLevel {
  Debug = 0,
  Information = 1,
  Warning = 2,
  Error = 3,
  None = 4,
}

export class Logger {
  constructor(private source: string, private minLogLevel: LogLevel) {}

  log(logLevel: LogLevel, message: string, ...args: any[]): void {
    if (logLevel < this.minLogLevel) return;

    const timestamp = `[${new Date().toISOString()}]`;
    const source = `[${this.source}]`;

    switch (logLevel) {
      case LogLevel.Error:
        console.error(timestamp, source, message, ...args);
        break;
      case LogLevel.Warning:
        console.warn(timestamp, source, message, ...args);
        break;
      case LogLevel.Information:
        console.info(timestamp, source, message, ...args);
        break;
      case LogLevel.Debug:
        console.debug(timestamp, source, message, ...args);
        break;
    }
  }

  logDebug(message: string, ...args: any[]) {
    this.log(LogLevel.Debug, message, ...args);
  }

  logInfo(message: string, ...args: any[]) {
    this.log(LogLevel.Information, message, ...args);
  }

  logWarn(message: string, ...args: any[]) {
    this.log(LogLevel.Warning, message, ...args);
  }

  logError(message: string, ...args: any[]) {
    this.log(LogLevel.Error, message, ...args);
  }

  static create(name: string, minLogLevel: LogLevel = LogLevel.Information) {
    return new Logger(name, minLogLevel);
  }
}
