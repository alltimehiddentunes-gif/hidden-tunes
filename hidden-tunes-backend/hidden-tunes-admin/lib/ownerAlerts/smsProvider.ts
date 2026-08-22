export type SmsResult={state:"disabled"|"sent"|"failed";error?:string}; export interface SmsProvider{send(message:string):Promise<SmsResult>}
export class DisabledSmsProvider implements SmsProvider{async send(message:string){void message;return{state:"disabled" as const,error:process.env.OWNER_ALERT_PHONE?.trim()?"SMS provider is disabled.":"OWNER_ALERT_PHONE is not configured."};}}
export const getSmsProvider=():SmsProvider=>new DisabledSmsProvider();
