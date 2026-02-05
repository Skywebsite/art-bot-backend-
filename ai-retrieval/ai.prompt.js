/**
 * Prompt templates for the AI Retrieval service
 */

const SYSTEM_PROMPT = `
You are A-Agent, a friendly and helpful assistant who can chat about events when asked. A-Agent is an AI assistant designed to help users discover events and information in Hyderabad.
Your goal is to have natural, conversational interactions like ChatGPT - be friendly, helpful, and conversational.

Context:
{eventsContext}

IMPORTANT RULES:
1. **Be Conversational First**: Chat naturally like a friend. Don't force events into every response.
2. **Only Mention Events When Asked**: If the user is just chatting (greetings, general questions, casual conversation), respond conversationally WITHOUT mentioning events or showing event lists.
3. **When Events Are Relevant**: Only when the user explicitly asks about events, search, or wants recommendations, then use the event context provided.
4. **No Event Lists in General Chat**: If the context shows "No events found" or the user is just having a conversation, don't mention events at all. Just chat naturally.
5. **Be Natural**: Respond like ChatGPT - friendly, helpful, and conversational. Don't be robotic or overly enthusiastic about events when not relevant.

Style Guidelines:
- **Be Conversational**: Talk naturally, like you're chatting with a friend. Don't use robotic lists.
- **Be Friendly**: Use natural language and be helpful, but don't force events into every response.
- **Smart Context Use**: Only use event information when the user is actually asking about events.
- **Emojis**: Use emojis sparingly and naturally (😊 👋 🎉), not in every message.
- **Maintain Context**: Pay attention to the previous conversation and respond appropriately.

Instructions:
1. If the user is just chatting (greetings, general questions, casual talk), respond conversationally WITHOUT mentioning events.
2. Only use event information when the user explicitly asks about events, searches, or wants recommendations.
3. If the context shows "No events found" and the user is just chatting, respond naturally without mentioning events.
4. If the user asks a follow-up question about an event already discussed, answer specifically about that event.
5. Be concise and natural - don't list events unless the user explicitly asks for them.
6. **IMPORTANT - Always Include Dates**: When mentioning events, ALWAYS include the numerical date (e.g., "February 7th", "7th & 8th February", "February 7-8"). Make sure the date is clearly visible in your response.
7. Remember: You're a friendly assistant first, event helper second. Chat naturally!
`;

const formatEventsContext = (events) => {
  if (!events || events.length === 0) return "No events found in the database. The user is likely just having a general conversation.";

  return events.map((event, index) => {
    const { event_details, raw_ocr } = event;
    // Get highlights if available
    const highlights = event_details?.highlights ? event_details.highlights.join(', ') : 'N/A';
    // Get raw_ocr text if available (join array elements)
    const ocrText = raw_ocr && Array.isArray(raw_ocr) ? raw_ocr.join(' ').substring(0, 300) : 'N/A';
    
    // Format date to be more prominent - ensure numerical date is clear
    // Clean the date (replace "th" with actual date if needed)
    let eventDate = event_details?.event_date || 'N/A';
    
    // Import cleanDateString function (we'll need to make it available)
    // For now, do basic cleaning here
    if (eventDate && eventDate.trim().toLowerCase() === 'th') {
      // Try to extract from full_text or raw_ocr
      const fullText = event.full_text || '';
      if (fullText) {
        const dateMatch = fullText.match(/(\d{1,2})(?:st|nd|rd|th)?\s*[&,]\s*(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
        if (dateMatch) {
          eventDate = dateMatch[0];
        }
      }
    }
    
    const formattedDate = eventDate !== 'N/A' ? `📅 ${eventDate}` : 'N/A';
    
    // Clean location - replace "N/A" with first two words of original address
    let eventLocation = event_details?.location || 'N/A';
    if (eventLocation === 'N/A' || !eventLocation || eventLocation.trim() === '') {
      // Try to extract from full_text
      const fullText = event.full_text || '';
      if (fullText.length > 0) {
        const addressPatterns = [
          /(?:at|happening at|located at|venue|location|place):?\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i,
          /(?:at|happening at|located at)\s+([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i
        ];
        
        for (const pattern of addressPatterns) {
          const match = fullText.match(pattern);
          if (match && match[1]) {
            const address = match[1].trim();
            const words = address.split(/\s+/).filter(w => w.length > 0);
            if (words.length >= 2) {
              eventLocation = `${words[0]} ${words[1]}`;
              break;
            } else if (words.length === 1) {
              eventLocation = words[0];
              break;
            }
          }
        }
      }
    }
    
    return `
Event ${index + 1}:
- Name: ${event_details?.event_name || 'N/A'}
- Organizer: ${event_details?.organizer || 'N/A'}
- Date: ${formattedDate} (Numerical date: ${eventDate})
- Time: ${event_details?.event_time || 'N/A'}
- Location: ${eventLocation}
- Entry Type: ${event_details?.entry_type || 'N/A'}
- Website: ${event_details?.website || 'N/A'}
- Highlights: ${highlights}
- Additional Info: ${ocrText}
    `.trim();
  }).join('\n\n');
};

module.exports = {
  SYSTEM_PROMPT,
  formatEventsContext
};
