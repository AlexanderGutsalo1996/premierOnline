import type { RegistrationData } from '../pages/Register';

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value?.trim()) {
        throw new Error(`Missing environment variable ${name}. Set it in .env.local or the process environment.`);
    }
    return value;
}

export function getRegistrationData(): RegistrationData {
    return {
        email: requiredEnv('REGISTRATION_EMAIL'),
        firstName: requiredEnv('REGISTRATION_FIRST_NAME'),
        lastName: requiredEnv('REGISTRATION_LAST_NAME'),
        password: requiredEnv('REGISTRATION_PASSWORD'),
        repeatPassword: requiredEnv('REGISTRATION_REPEAT_PASSWORD'),
    };
}
