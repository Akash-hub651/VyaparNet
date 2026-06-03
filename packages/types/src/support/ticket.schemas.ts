import { z } from "zod";

export const SupportTicketReplySchema = z
  .object({
    message: z.string().min(1, "Message cannot be empty").max(5000),
    clientMessageId: z.string().min(1, "clientMessageId is required"),
  })
  .strict();

export type SupportTicketReplyDto = z.infer<typeof SupportTicketReplySchema>;
