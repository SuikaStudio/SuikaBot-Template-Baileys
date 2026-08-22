export type WebhookHandler = (req: Request) => Promise<Response> | Response;

export interface WebhookRoute {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ALL';
  handler: WebhookHandler;
}
