import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../types';

export async function shouldRespondInGroup(
  config: Config,
  botUsername: string,
  message: string,
  senderName: string,
  recentMessages: string[],
): Promise<boolean> {
  // Always respond if directly mentioned
  if (message.includes(`@${botUsername}`)) return true;

  // Use classifier model to decide
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: config.classifierModel,
    max_tokens: 10,
    system: `You are a group chat participant. Decide if you should respond to this message.
Respond "YES" if:
- Someone asks a question you can help with
- You can add genuine value to the conversation
- Someone is seeking information or advice

Respond "NO" if:
- It's casual banter between people
- Someone already answered adequately
- Your response would just be agreement ("yeah", "nice", "exactly")
- The conversation is flowing fine without you

Respond with ONLY "YES" or "NO".`,
    messages: [{
      role: 'user',
      content: `Recent messages:\n${recentMessages.join('\n')}\n\nNew message from ${senderName}: ${message}`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return text.trim().toUpperCase().startsWith('YES');
}
