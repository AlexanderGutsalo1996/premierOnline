type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
 
const LEVEL_WEIGHT: Record<LogLevel, number> = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40
};
 
export class Logger {
    private readonly minLevel: LogLevel;
 
    constructor(private readonly context: string) {
        const envLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;
        this.minLevel = envLevel in LEVEL_WEIGHT ? envLevel : 'INFO';
    }
 
    debug(message: string): void {
        this.log('DEBUG', message);
    }
 
    info(message: string): void {
        this.log('INFO', message);
    }
 
    warn(message: string): void {
        this.log('WARN', message);
    }
 
    error(message: string): void {
        this.log('ERROR', message);
    }
 
    private log(level: LogLevel, message: string): void {
        if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) {
            return;
        }
 
        const line = `${new Date().toISOString()} [${level}] [${this.context}] ${message}`;
 
        if (level === 'ERROR') {
            console.error(line);
        } else if (level === 'WARN') {
            console.warn(line);
        } else {
            console.log(line);
        }
    }
}