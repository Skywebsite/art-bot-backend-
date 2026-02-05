const mongoose = require('mongoose');
const { SYSTEM_PROMPT, formatEventsContext } = require('./ai.prompt');

// Get the event_database database reference
const getEventsDB = () => {
    try {
        // Try direct access first
        const db = mongoose.connection.client.db('event_database');
        console.log(`[DB Access] Connected to database: ${db.databaseName}`);
        return db;
    } catch (err) {
        console.log(`[DB Access] Error accessing event_database: ${err.message}`);
        // Fallback to useDb
        const dbConnection = mongoose.connection.useDb('event_database');
        return dbConnection.db || dbConnection;
    }
};

/**
 * AI Configuration for Eden AI
 */
const CONFIG = {
    apiKey: process.env.OPENAI_API_KEY,
    chatProvider: process.env.AI_PROVIDER || 'google',
    llmModel: process.env.LLM_MODEL || 'gemini-1.5-flash',
    embeddingProvider: process.env.EMBEDDING_PROVIDER || 'openai',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.edenai.run/v2'
};

/**
 * Helper function to extract user name from response
 */
const extractUserName = (text) => {
    // Remove common prefixes and clean up
    let name = text.trim();
    // Remove "my name is", "i'm", "i am", "it's", "it is" etc.
    name = name.replace(/^(my name is|i'?m|i am|it'?s|it is|this is|call me|name'?s)\s+/i, '');
    // Remove trailing punctuation
    name = name.replace(/[.,!?]+$/, '');
    // Take first word or first few words (max 3 words for name)
    const words = name.split(/\s+/).slice(0, 3);
    return words.join(' ').trim();
};

/**
 * Extract user name from conversation history
 */
const getUserName = (conversationHistory) => {
    // Look through conversation history for name
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if (msg.role === 'user') {
            // Check if previous AI message was asking for name
            if (i > 0 && conversationHistory[i - 1].role === 'ai') {
                const prevAIMsg = conversationHistory[i - 1].content.toLowerCase();
                if (prevAIMsg.includes('what is ur name') || 
                    prevAIMsg.includes('what is your name') ||
                    prevAIMsg.includes("what's your name")) {
                    return extractUserName(msg.content);
                }
            }
        }
    }
    return null;
};

/**
 * Check if we should ask for user's name
 */
const shouldAskForName = (conversationHistory) => {
    if (!conversationHistory || conversationHistory.length === 0) {
        return false;
    }

    // Check if user has already provided their name
    const existingName = getUserName(conversationHistory);
    if (existingName) {
        return false; // Already have name
    }

    // Count user messages - if this is the first user message, ask for name
    const userMessages = conversationHistory.filter(msg => msg.role === 'user');
    
    // If this is the first user message (only 1 user message in history)
    if (userMessages.length === 1) {
        // Check if we already asked for name in any AI message
        const hasAskedForName = conversationHistory.some(msg => 
            msg.role === 'ai' && 
            (msg.content.toLowerCase().includes('what is ur name') || 
             msg.content.toLowerCase().includes('what is your name') ||
             msg.content.toLowerCase().includes("what's your name"))
        );
        if (!hasAskedForName) {
            console.log("[Name Check] First user message detected, asking for name");
            return true;
        }
    }
    
    return false;
};

/**
 * Check if user just provided their name
 */
const isNameResponse = (conversationHistory) => {
    if (conversationHistory.length >= 2) {
        const lastAIMessage = conversationHistory[conversationHistory.length - 2];
        if (lastAIMessage.role === 'ai' && 
            (lastAIMessage.content.toLowerCase().includes('what is ur name') || 
             lastAIMessage.content.toLowerCase().includes('what is your name') ||
             lastAIMessage.content.toLowerCase().includes("what's your name"))) {
            return true;
        }
    }
    return false;
};

/**
 * Clean and fix date string - replace "th" with actual date if needed
 */
const cleanDateString = (dateString, event = null) => {
    if (!dateString || dateString === 'N/A') {
        return dateString;
    }
    
    const trimmed = dateString.trim();
    
    // If date is just "th" or similar invalid values, try to extract from other fields
    if (trimmed.toLowerCase() === 'th' || trimmed.length <= 2 || trimmed === 'N/A') {
        console.log(`[Date Cleaner] Invalid date found: "${trimmed}", attempting to extract from other fields...`);
        
        if (event) {
            // Try to extract date from full_text
            const fullText = event.full_text || '';
            if (fullText.length > 0) {
                // Look for date patterns in full_text
                const datePatterns = [
                    /(\d{1,2})(?:st|nd|rd|th)?\s*[&,]\s*(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
                    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[&,]\s*(\d{1,2})(?:st|nd|rd|th)?/i,
                    /(\d{1,2})[-\/]\s*(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
                    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})[-\/]\s*(\d{1,2})/i,
                    /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
                    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?/i
                ];
                
                for (const pattern of datePatterns) {
                    const match = fullText.match(pattern);
                    if (match) {
                        const extractedDate = match[0];
                        console.log(`[Date Cleaner] ✓ Extracted date from full_text: "${extractedDate}"`);
                        return extractedDate;
                    }
                }
            }
            
            // Try raw_ocr
            const rawOcr = event.raw_ocr || '';
            if (rawOcr && Array.isArray(rawOcr)) {
                const ocrText = rawOcr.join(' ');
                const allNumbers = ocrText.match(/\d{1,2}/g);
                const monthMap = {
                    'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
                    'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5,
                    'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8,
                    'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
                };
                const ocrLower = ocrText.toLowerCase();
                const allMonths = Object.keys(monthMap).filter(month => ocrLower.includes(month));
                
                if (allNumbers && allNumbers.length > 0 && allMonths && allMonths.length > 0) {
                    const validDays = allNumbers.map(n => parseInt(n)).filter(n => n >= 1 && n <= 31);
                    if (validDays.length > 0) {
                        const day = validDays[0];
                        const monthName = allMonths[0];
                        const formattedDate = `${day}${getOrdinalSuffix(day)} ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
                        console.log(`[Date Cleaner] ✓ Constructed date from raw_ocr: "${formattedDate}"`);
                        return formattedDate;
                    }
                }
            }
        }
        
        console.log(`[Date Cleaner] ❌ Could not extract date, keeping original: "${trimmed}"`);
        return trimmed; // Return original if we can't fix it
    }
    
    return dateString; // Return as-is if it's valid
};

/**
 * Get ordinal suffix for day (1st, 2nd, 3rd, 4th, etc.)
 */
const getOrdinalSuffix = (day) => {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
};

/**
 * Clean and fix location string - replace "N/A" with first two words of original address
 * Also replace "NE" with "Ashoka mall"
 */
const cleanLocationString = (locationString, event = null) => {
    // First, handle "NE" replacement
    if (locationString && locationString.trim().toUpperCase() === 'NE') {
        // Try to extract full address from other fields
        if (event) {
            const fullText = event.full_text || '';
            if (fullText.length > 0) {
                // Look for "Ashoka" or "Ashoka One" or "Ashoka One Mall" in the text
                const ashokaPatterns = [
                    /(?:at|happening at|located at|venue|location|place):?\s*(Ashoka\s+One\s+Mall[^,)]*)/i,
                    /(?:at|happening at|located at|venue|location|place):?\s*(Ashoka\s+One[^,)]*)/i,
                    /(?:at|happening at|located at|venue|location|place):?\s*(Ashoka[^,)]*)/i,
                    /(Ashoka\s+One\s+Mall[^,)]*)/i,
                    /(Ashoka\s+One[^,)]*)/i,
                    /(Ashoka[^,)]*)/i
                ];
                
                for (const pattern of ashokaPatterns) {
                    const match = fullText.match(pattern);
                    if (match && match[1]) {
                        const address = match[1].trim();
                        // Clean up the address - take first two words or "Ashoka mall"
                        const words = address.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2) {
                            // If we have "Ashoka One Mall", return "Ashoka mall"
                            if (words[0].toLowerCase() === 'ashoka' && words[1].toLowerCase() === 'one') {
                                console.log(`[Location Cleaner] ✓ Replaced "NE" with "Ashoka mall" from full_text`);
                                return 'Ashoka mall';
                            }
                            // Otherwise return first two words
                            return `${words[0]} ${words[1]}`;
                        } else if (words.length === 1 && words[0].toLowerCase() === 'ashoka') {
                            console.log(`[Location Cleaner] ✓ Replaced "NE" with "Ashoka mall"`);
                            return 'Ashoka mall';
                        }
                    }
                }
            }
            
            // Try raw_ocr
            const rawOcr = event.raw_ocr || '';
            if (rawOcr && Array.isArray(rawOcr)) {
                const ocrText = rawOcr.join(' ');
                const ashokaPatterns = [
                    /(Ashoka\s+One\s+Mall[^,)]*)/i,
                    /(Ashoka\s+One[^,)]*)/i,
                    /(Ashoka[^,)]*)/i
                ];
                
                for (const pattern of ashokaPatterns) {
                    const match = ocrText.match(pattern);
                    if (match && match[1]) {
                        const address = match[1].trim();
                        const words = address.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2) {
                            if (words[0].toLowerCase() === 'ashoka' && words[1].toLowerCase() === 'one') {
                                console.log(`[Location Cleaner] ✓ Replaced "NE" with "Ashoka mall" from raw_ocr`);
                                return 'Ashoka mall';
                            }
                            return `${words[0]} ${words[1]}`;
                        } else if (words.length === 1 && words[0].toLowerCase() === 'ashoka') {
                            console.log(`[Location Cleaner] ✓ Replaced "NE" with "Ashoka mall" from raw_ocr`);
                            return 'Ashoka mall';
                        }
                    }
                }
            }
        }
        
        // Default fallback if we can't extract
        console.log(`[Location Cleaner] ✓ Replaced "NE" with "Ashoka mall" (default)`);
        return 'Ashoka mall';
    }
    
    if (!locationString || locationString === 'N/A' || locationString.trim() === '' || locationString.trim() === 'N/A') {
        // Try to extract address from other fields
        if (event) {
            // Try to extract address from full_text
            const fullText = event.full_text || '';
            if (fullText.length > 0) {
                // Look for address patterns - "at [Location]", "happening at [Location]", etc.
                const addressPatterns = [
                    /(?:at|happening at|located at|venue|location|place):?\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i,
                    /(?:at|happening at|located at|venue|location|place):?\s+([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i,
                    /(?:at|happening at|located at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/i
                ];
                
                for (const pattern of addressPatterns) {
                    const match = fullText.match(pattern);
                    if (match && match[1]) {
                        const address = match[1].trim();
                        // Get first two words
                        const words = address.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2) {
                            console.log(`[Location Cleaner] ✓ Extracted address from full_text: "${words[0]} ${words[1]}"`);
                            return `${words[0]} ${words[1]}`;
                        } else if (words.length === 1) {
                            console.log(`[Location Cleaner] ✓ Extracted address from full_text: "${words[0]}"`);
                            return words[0];
                        }
                    }
                }
                
                // Fallback: Look for capitalized words that might be locations
                const capitalizedWords = fullText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g);
                if (capitalizedWords && capitalizedWords.length > 0) {
                    // Filter out common non-location words
                    const skipWords = ['Event', 'Date', 'Time', 'Entry', 'Free', 'Contact', 'Website', 'Organizer', 'February', 'January', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    const locationCandidates = capitalizedWords.filter(phrase => {
                        const words = phrase.split(/\s+/);
                        return !words.some(w => skipWords.includes(w));
                    });
                    
                    if (locationCandidates.length > 0) {
                        const firstCandidate = locationCandidates[0];
                        const words = firstCandidate.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2) {
                            console.log(`[Location Cleaner] ✓ Extracted address from capitalized words: "${words[0]} ${words[1]}"`);
                            return `${words[0]} ${words[1]}`;
                        } else if (words.length === 1) {
                            console.log(`[Location Cleaner] ✓ Extracted address from capitalized words: "${words[0]}"`);
                            return words[0];
                        }
                    }
                }
            }
            
            // Try raw_ocr
            const rawOcr = event.raw_ocr || '';
            if (rawOcr && Array.isArray(rawOcr)) {
                const ocrText = rawOcr.join(' ');
                // Look for address patterns
                const addressPatterns = [
                    /(?:at|happening at|located at|venue|location|place):?\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i,
                    /(?:at|happening at|located at)\s+([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i
                ];
                
                for (const pattern of addressPatterns) {
                    const match = ocrText.match(pattern);
                    if (match && match[1]) {
                        const address = match[1].trim();
                        const words = address.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2) {
                            console.log(`[Location Cleaner] ✓ Extracted address from raw_ocr: "${words[0]} ${words[1]}"`);
                            return `${words[0]} ${words[1]}`;
                        } else if (words.length === 1) {
                            console.log(`[Location Cleaner] ✓ Extracted address from raw_ocr: "${words[0]}"`);
                            return words[0];
                        }
                    }
                }
                
                // Fallback: Look for capitalized phrases
                const capitalizedWords = ocrText.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g);
                if (capitalizedWords && capitalizedWords.length > 0) {
                    const skipWords = ['Event', 'Date', 'Time', 'Entry', 'Free', 'Contact', 'Website', 'Organizer'];
                    const locationCandidates = capitalizedWords.filter(phrase => {
                        const words = phrase.split(/\s+/);
                        return !words.some(w => skipWords.includes(w));
                    });
                    
                    if (locationCandidates.length > 0) {
                        const firstCandidate = locationCandidates[0];
                        const words = firstCandidate.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2) {
                            console.log(`[Location Cleaner] ✓ Extracted address from raw_ocr capitalized: "${words[0]} ${words[1]}"`);
                            return `${words[0]} ${words[1]}`;
                        }
                    }
                }
            }
        }
        
        console.log(`[Location Cleaner] ❌ Could not extract location, keeping original: "${locationString}"`);
        return locationString; // Return original if we can't extract
    }
    
    return locationString; // Return as-is if it's valid
};

/**
 * Parse date from event date string (handles various formats)
 */
const parseEventDate = (dateString, event = null) => {
    // First, clean the date string (replace "th" with actual date if needed)
    const cleanedDateString = cleanDateString(dateString, event);
    
    if (!cleanedDateString || cleanedDateString === 'N/A' || cleanedDateString.trim() === '' || cleanedDateString.trim().length <= 2) {
        return null;
    }

    // Try to parse various date formats
    const originalDateStr = cleanedDateString.trim();
    const dateStr = originalDateStr.toLowerCase().trim();
    console.log(`[Date Parser] Parsing date string: "${originalDateStr}" -> normalized: "${dateStr}"`);
    
    const monthMap = {
        'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
        'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5,
        'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8,
        'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
    };
    
    // FIRST: Try the most lenient approach - find ANY number and ANY month name
    // This catches formats like "7th and 8th February", "7 & 8 FEB", etc.
    // Clean the string first - remove extra whitespace and special characters that might interfere
    const cleanedDateStr = dateStr.replace(/\s+/g, ' ').trim();
    const allNumbers = cleanedDateStr.match(/\d{1,2}/g);
    const allMonths = Object.keys(monthMap).filter(month => cleanedDateStr.includes(month));
    
    // Store for debug logging
    const debugNumbers = allNumbers;
    const debugMonths = allMonths;
    
    if (allNumbers && allNumbers.length > 0 && allMonths && allMonths.length > 0) {
        // Use the first number and first month found
        // Filter out numbers that are clearly not days (like years > 31)
        const validDays = allNumbers.map(n => parseInt(n)).filter(n => n >= 1 && n <= 31);
        
        if (validDays.length > 0) {
            const day = validDays[0]; // Use first valid day
            const monthName = allMonths[0];
            const month = monthMap[monthName];
            const currentYear = new Date().getFullYear();
            
            const parsedDate = new Date(currentYear, month, day);
            console.log(`[Date Parser] ✓ Matched lenient pattern: Found day=${day}, month=${monthName} (${month + 1}) -> ${parsedDate.toISOString().split('T')[0]}`);
            return parsedDate;
        }
    }
    
    // Format: "January 25, 2026" or "Jan 25, 2026"
    const monthDayYear = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
    if (monthDayYear) {
        const month = monthMap[monthDayYear[1].toLowerCase()];
        const day = parseInt(monthDayYear[2]);
        const year = parseInt(monthDayYear[3]);
        return new Date(year, month, day);
    }

    // Format: "25 January 2026" or "25 Jan 2026"
    const dayMonthYear = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i);
    if (dayMonthYear) {
        const day = parseInt(dayMonthYear[1]);
        const month = monthMap[dayMonthYear[2].toLowerCase()];
        const year = parseInt(dayMonthYear[3]);
        return new Date(year, month, day);
    }
    
    // Format: "2 feb" or "7th feb" (day month without year - assume current year)
    const dayMonth = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (dayMonth) {
        const day = parseInt(dayMonth[1]);
        const month = monthMap[dayMonth[2].toLowerCase()];
        const currentYear = new Date().getFullYear();
        return new Date(currentYear, month, day);
    }
    
    // Format: "feb 2" or "feb 7th" (month day without year - assume current year)
    const monthDay = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
    if (monthDay) {
        const month = monthMap[monthDay[1].toLowerCase()];
        const day = parseInt(monthDay[2]);
        const currentYear = new Date().getFullYear();
        return new Date(currentYear, month, day);
    }
    
    // Format: "7th & 8th FEB" or "7 & 8 FEB" or "7th, 8th FEB" - extract first date
    const multipleDates = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s*[&,]\s*(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (multipleDates) {
        const day = parseInt(multipleDates[1]); // Use first date
        const month = monthMap[multipleDates[3].toLowerCase()];
        const currentYear = new Date().getFullYear();
        return new Date(currentYear, month, day);
    }
    
    // Format: "7 & 8 FEB" (without ordinal suffixes)
    const multipleDatesSimple = dateStr.match(/(\d{1,2})\s*[&,]\s*(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (multipleDatesSimple) {
        const day = parseInt(multipleDatesSimple[1]); // Use first date
        const month = monthMap[multipleDatesSimple[3].toLowerCase()];
        const currentYear = new Date().getFullYear();
        return new Date(currentYear, month, day);
    }
    
    // Format: "FEB 7 & 8" or "FEBRUARY 7 & 8"
    const monthMultipleDates = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[&,]\s*(\d{1,2})(?:st|nd|rd|th)?/i);
    if (monthMultipleDates) {
        const month = monthMap[monthMultipleDates[1].toLowerCase()];
        const day = parseInt(monthMultipleDates[2]); // Use first date
        const currentYear = new Date().getFullYear();
        console.log(`[Date Parser] Matched "month day & day" format: ${day}/${month + 1}/${currentYear}`);
        return new Date(currentYear, month, day);
    }
    
    // Format: "7-8 FEB" or "7/8 FEB" (with dash or slash)
    const dashMultipleDates = dateStr.match(/(\d{1,2})[-\/]\s*(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (dashMultipleDates) {
        const day = parseInt(dashMultipleDates[1]); // Use first date
        const month = monthMap[dashMultipleDates[3].toLowerCase()];
        const currentYear = new Date().getFullYear();
        console.log(`[Date Parser] Matched "day-day month" format: ${day}/${month + 1}/${currentYear}`);
        return new Date(currentYear, month, day);
    }
    
    // Format: "FEB 7-8" or "FEBRUARY 7/8"
    const monthDashDates = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})[-\/]\s*(\d{1,2})/i);
    if (monthDashDates) {
        const month = monthMap[monthDashDates[1].toLowerCase()];
        const day = parseInt(monthDashDates[2]); // Use first date
        const currentYear = new Date().getFullYear();
        console.log(`[Date Parser] Matched "month day-day" format: ${day}/${month + 1}/${currentYear}`);
        return new Date(currentYear, month, day);
    }

    // Format: "2026-01-25" or "01/25/2026" or "25/01/2026"
    const isoDate = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (isoDate) {
        // Check if it's YYYY-MM-DD or MM/DD/YYYY or DD/MM/YYYY
        if (dateStr.includes('-')) {
            // YYYY-MM-DD
            return new Date(parseInt(isoDate[1]), parseInt(isoDate[2]) - 1, parseInt(isoDate[3]));
        } else {
            // Try MM/DD/YYYY first, then DD/MM/YYYY
            const month = parseInt(isoDate[2]);
            const day = parseInt(isoDate[3]);
            if (month > 12) {
                // Must be DD/MM/YYYY
                return new Date(parseInt(isoDate[1]), day - 1, month);
            } else {
                // Assume MM/DD/YYYY
                return new Date(parseInt(isoDate[1]), month - 1, day);
            }
        }
    }

    // Try native Date parsing as fallback
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
        console.log(`[Date Parser] Matched native Date parsing: ${parsed.toISOString().split('T')[0]}`);
        return parsed;
    }

    // Last resort: Try to extract any number and month name from the string (more flexible regex)
    const anyNumberMonth = dateStr.match(/(\d{1,2}).*?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (anyNumberMonth) {
        const day = parseInt(anyNumberMonth[1]);
        const month = monthMap[anyNumberMonth[2].toLowerCase()];
        const currentYear = new Date().getFullYear();
        if (day >= 1 && day <= 31) {
            console.log(`[Date Parser] ✓ Matched fallback pattern (any number + month): ${day}/${month + 1}/${currentYear}`);
            return new Date(currentYear, month, day);
        }
    }
    
    // Even more lenient: Try to find month name first, then number
    const monthFirst = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*?(\d{1,2})/i);
    if (monthFirst) {
        const month = monthMap[monthFirst[1].toLowerCase()];
        const day = parseInt(monthFirst[2]);
        const currentYear = new Date().getFullYear();
        if (day >= 1 && day <= 31) {
            console.log(`[Date Parser] ✓ Matched reverse pattern (month + number): ${day}/${month + 1}/${currentYear}`);
            return new Date(currentYear, month, day);
        }
    }

    console.log(`[Date Parser] ❌ Failed to parse date: "${originalDateStr}"`);
    console.log(`[Date Parser] Debug - All numbers found: ${debugNumbers ? debugNumbers.join(', ') : 'none'}`);
    console.log(`[Date Parser] Debug - All months found: ${debugMonths ? debugMonths.join(', ') : 'none'}`);
    return null;
};

/**
 * Get events filtered by date (today, tomorrow, this week)
 */
const getEventsByDate = async (dateFilter) => {
    try {
        // Get all events
        const db = getEventsDB();
        const eventsCollection = db.collection('events');
        const totalCount = await eventsCollection.countDocuments();
        console.log(`[Date Filter] Total documents in collection: ${totalCount}`);
        
        const allEvents = await eventsCollection
            .find({})
            .limit(200) // Get more events to filter from
            .toArray();

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset to start of day

        const filteredEvents = [];

        console.log(`[Date Filter] Today's date: ${today.toISOString().split('T')[0]} (${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()})`);
        console.log(`[Date Filter] Processing ${allEvents.length} events from database`);
        
        let parseSuccessCount = 0;
        let parseFailCount = 0;
        
        for (const event of allEvents) {
            const eventDateStr = event.event_details?.event_date;
            if (!eventDateStr || eventDateStr === 'N/A' || eventDateStr.trim().length <= 2) {
                console.log(`[Date Filter] Skipping event - invalid date string: "${eventDateStr}" for event: ${event.event_details?.event_name || 'Unknown'}`);
                parseFailCount++;
                continue;
            }

            // Log the actual date string for debugging
            console.log(`[Date Filter] Attempting to parse date: "${eventDateStr}" for event: ${event.event_details?.event_name || 'Unknown'}`);
            
            const eventDate = parseEventDate(eventDateStr, event);
            if (!eventDate) {
                console.log(`[Date Filter] ❌ Could not parse date: "${eventDateStr}" for event: ${event.event_details?.event_name || 'Unknown'}`);
                parseFailCount++;
                // If date parsing fails but event has a valid name, still include it for "all events" queries
                // This helps when dates are in unusual formats
                continue;
            }

            eventDate.setHours(0, 0, 0, 0); // Reset to start of day
            parseSuccessCount++;
            
            // Only log first few to avoid spam
            if (parseSuccessCount <= 5) {
                console.log(`[Date Filter] Parsed "${eventDateStr}" -> ${eventDate.toISOString().split('T')[0]} (${eventDate.getDate()}/${eventDate.getMonth() + 1}/${eventDate.getFullYear()})`);
            }

            let shouldInclude = false;

            if (dateFilter === 'today') {
                // Check if event is today
                shouldInclude = eventDate.getTime() === today.getTime();
                if (shouldInclude) {
                    console.log(`[Date Filter] ✓ Event matches TODAY: ${event.event_details?.event_name} (${eventDateStr})`);
                }
            } else if (dateFilter === 'tomorrow') {
                // Check if event is tomorrow
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                shouldInclude = eventDate.getTime() === tomorrow.getTime();
                if (shouldInclude) {
                    console.log(`[Date Filter] ✓ Event matches TOMORROW: ${event.event_details?.event_name} (${eventDateStr})`);
                }
            } else if (dateFilter === 'week') {
                // Check if event is within the next 7 days (including today)
                const weekEnd = new Date(today);
                weekEnd.setDate(weekEnd.getDate() + 7);
                shouldInclude = eventDate >= today && eventDate <= weekEnd;
                if (shouldInclude) {
                    console.log(`[Date Filter] ✓ Event matches THIS WEEK: ${event.event_details?.event_name} (${eventDateStr} -> ${eventDate.toISOString().split('T')[0]})`);
                }
            } else if (dateFilter === 'future' || dateFilter === 'upcoming') {
                // Check if event is in the future (after today, including today)
                shouldInclude = eventDate >= today;
                if (shouldInclude) {
                    console.log(`[Date Filter] ✓ Event matches FUTURE/UPCOMING: ${event.event_details?.event_name} (${eventDateStr} -> ${eventDate.toISOString().split('T')[0]})`);
                } else {
                    // Log why event was excluded (for debugging)
                    if (parseSuccessCount <= 10) {
                        console.log(`[Date Filter] ✗ Event excluded (past date): ${event.event_details?.event_name} (${eventDateStr} -> ${eventDate.toISOString().split('T')[0]}, today: ${today.toISOString().split('T')[0]})`);
                    }
                }
            }

            if (shouldInclude) {
                filteredEvents.push(event);
            }
        }
        
        console.log(`[Date Filter] Summary: ${parseSuccessCount} dates parsed successfully, ${parseFailCount} failed to parse`);
        console.log(`[Date Filter] Total filtered events for "${dateFilter}": ${filteredEvents.length}`);

        // Sort by date (earliest first)
        filteredEvents.sort((a, b) => {
            const dateA = parseEventDate(a.event_details?.event_date, a);
            const dateB = parseEventDate(b.event_details?.event_date, b);
            if (!dateA || !dateB) return 0;
            return dateA - dateB;
        });

        return filteredEvents.slice(0, 50); // Limit to 50 events
    } catch (error) {
        console.error('[Date Filter Error]:', error.message);
        return [];
    }
};

/**
 * ---------------------------------------------------------
 *  INTENT RECOGNITION (Simple Dialogflow-like Logic)
 * ---------------------------------------------------------
 */
const detectIntent = async (question, conversationHistory = []) => {
    const q = question.toLowerCase();

    // 0. EVENT-BASED DATE QUERIES - Check FIRST before simple date questions
    // If query asks about events happening today/tomorrow/this week, handle as event query
    // This MUST be checked before date question intent to avoid conflicts
    const hasEventKeyword = q.includes('events') || q.includes('event');
    const hasTodayKeyword = q.includes('today') || q.includes('happening today') || q.includes('tdy');
    const hasWhatKeyword = q.includes('what') || q.includes('which') || q.includes('show');
    
    // Check for event queries with date keywords - prioritize these over simple date questions
    if (hasEventKeyword && hasTodayKeyword) {
        console.log("[Intent] ✓✓✓ EVENT QUERY WITH 'TODAY' DETECTED FIRST! ✓✓✓");
        console.log("[Intent] Query:", question);
        console.log("[Intent] hasEventKeyword:", hasEventKeyword, "hasTodayKeyword:", hasTodayKeyword);
        console.log("[Intent] Checking for events happening today...");
        const todayEvents = await getEventsByDate('today');
        console.log("[Intent] Found", todayEvents.length, "events for today");
        
        if (todayEvents.length > 0) {
            // Format dates for display
            const eventsWithDates = todayEvents.map(event => {
                let dateStr = event.event_details?.event_date || 'N/A';
                // Clean the date (replace "th" with actual date if needed)
                dateStr = cleanDateString(dateStr, event);
                const eventName = event.event_details?.event_name || 'Event';
                return `- ${eventName} on ${dateStr}`;
            }).join('\n');
            
            return {
                answer: `I found ${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} happening today! 📅\n\n${eventsWithDates}`,
                sources: todayEvents
            };
        } else {
            return {
                answer: `I couldn't find any events happening today. Would you like to see upcoming events instead?`,
                sources: todayEvents
            };
        }
    }
    
    // Also check for queries like "what's happening today" that might be asking about events
    if (hasWhatKeyword && hasTodayKeyword && (q.includes('happening') || q.includes('going on'))) {
        console.log("[Intent] Detected 'what's happening today' query - checking for events");
        const todayEvents = await getEventsByDate('today');
        
        if (todayEvents.length > 0) {
            const eventsWithDates = todayEvents.map(event => {
                let dateStr = event.event_details?.event_date || 'N/A';
                dateStr = cleanDateString(dateStr, event);
                const eventName = event.event_details?.event_name || 'Event';
                return `- ${eventName} on ${dateStr}`;
            }).join('\n');
            
            return {
                answer: `I found ${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} happening today! 📅\n\n${eventsWithDates}`,
                sources: todayEvents
            };
        } else {
            return {
                answer: `I couldn't find any events happening today. Would you like to see upcoming events instead?`,
                sources: todayEvents
            };
        }
    }

    // 0.5. DATE QUESTION INTENT - Check after event queries, return current date from code (not AI)
    // This MUST be checked before AI to prevent AI from answering, but AFTER event queries
    // Exclude queries that mention events, happening, or going on
    const qClean = q.replace(/[?.,!;:]/g, '').trim();
    const hasDateKeyword = /(date|tdy|today|day)/i.test(q);
    const hasQuestionWord = /(what|what's|whats|tell|show)/i.test(q);
    const hasEventOrHappeningKeyword = /(event|events|happening|going on)/i.test(q);
    const isDateQuestion = hasDateKeyword && hasQuestionWord && !hasEventOrHappeningKeyword; // Exclude if mentions events/happening
    const simpleDatePattern = /^(date|today|tdy|what date|what day|tdy date|what is date|whats date|what is tdy|whats tdy|what date tdy|what is date tdy)$/i;
    
    // Only return date if it's clearly asking "what is today" or "what date is today" WITHOUT mentioning events
    if ((isDateQuestion || simpleDatePattern.test(qClean) || simpleDatePattern.test(q.trim())) && !hasEventOrHappeningKeyword) {
        const today = new Date();
        const dateOptions = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            timeZone: 'Asia/Kolkata'
        };
        const currentDate = today.toLocaleDateString('en-US', dateOptions);
        console.log("[Intent] ✓✓✓ DATE QUESTION DETECTED! ✓✓✓");
        console.log("[Intent] Query:", question);
        console.log("[Intent] Returning date from CODE:", currentDate);
        return {
            answer: `Today is ${currentDate}. 😊`,
            sources: []
        };
    }

    // 1. GREETING INTENT - Return friendly conversational response without searching events
    // Match greetings at the start of the message (with optional words after like "bro", "dude", etc.)
    const greetingPattern = /^(hi|hello|hey|greetings|good morning|good evening|good afternoon|hii|hiii|heyy|heyyy|sup|what's up|wassup|yo|namaste|namaskar)(\s+\w+)?/i;
    if (greetingPattern.test(q.trim())) {
        // Check if user has a name from conversation or auth
        const userName = conversationHistory && conversationHistory.length > 0 
            ? getUserName(conversationHistory) 
            : null;
        
        // Get user name from the user object if available (passed from frontend)
        // This will be handled in getChatResponse function
        
        const personalizedGreeting = userName 
            ? `Hey ${userName}! 👋 How can I help you find some awesome events today? 😊`
            : `Hey there! 👋 How can I help you find some awesome events today? 😊`;
        
        console.log("[Intent] Greeting detected, returning conversational response");
        return {
            answer: personalizedGreeting,
            sources: [] // No events for greetings
        };
    }

    // 2. LIST ALL EVENTS INTENT
    if (q.includes('all events') || q.includes('show events') || q.includes('any events') || q.includes('latest events') || q.includes('popular events') || q.match(/^events$/) || q === 'yes' || q.includes('all available')) {
        // For "latest events", sort by _id descending (newest first) since MongoDB ObjectId contains timestamp
        // For "popular events", also sort by _id descending to get recent events
        const sortOrder = (q.includes('latest') || q.includes('popular')) ? { _id: -1 } : {};
        const db = getEventsDB();
        const eventsCollection = db.collection('events');
        const totalCount = await eventsCollection.countDocuments();
        console.log(`[List All Events] Total documents in collection: ${totalCount}`);
        
        // Get all events (or up to 100 for performance)
        const events = await eventsCollection
            .find({})
            .sort(sortOrder)
            .limit(100)
            .toArray();
        
        console.log(`[List All Events] Retrieved ${events.length} events from database`);
        
        // Log sample events to verify data structure
        if (events.length > 0) {
            console.log(`[List All Events] Sample event structure:`);
            const sample = events[0];
            console.log(`  - Event 1: ${sample.event_details?.event_name || 'N/A'}`);
            console.log(`  - Date: ${sample.event_details?.event_date || 'N/A'}`);
            console.log(`  - Location: ${sample.event_details?.location || 'N/A'}`);
            console.log(`  - Has event_details: ${!!sample.event_details}`);
            console.log(`  - Keys in event: ${Object.keys(sample).join(', ')}`);
        } else {
            console.log(`[List All Events] WARNING: No events retrieved from database!`);
        }
        
        // Filter out events with completely invalid data, but be very lenient
        const validEvents = events.filter(event => {
            const eventName = (event.event_details?.event_name || '').trim();
            // Only reject if event name is completely missing or just 1-2 characters
            return eventName.length > 2;
        });
        
        console.log(`[List All Events] After basic validation: ${validEvents.length} valid events`);
        
        if (validEvents.length === 0 && events.length > 0) {
            console.log(`[List All Events] Warning: All events were filtered out. Sample event structure:`, JSON.stringify(events[0], null, 2));
        }
        
        return {
            answer: q.includes('latest') 
                ? `Here are the ${validEvents.length} most recently posted events! 📅`
                : q.includes('popular')
                ? `Here are ${validEvents.length} popular events I found for you! 📅`
                : validEvents.length > 0
                ? `Here are ${validEvents.length} events I found for you! 📅`
                : totalCount > 0
                ? `I found ${totalCount} documents in the database, but they might not have valid event data. Please check the event structure.`
                : `I couldn't find any events in the database right now.`,
            sources: validEvents
        };
    }

    // 2.5. DATE-BASED EVENT QUERIES (Today, This Week, Upcoming)
    // Note: Event queries with "today" are already handled at the top (before date question intent)
    // This handles queries that mention "today" but might not explicitly say "events"
    if ((q.includes('today') || q.includes('happening today')) && !q.includes('what is') && !q.includes('what\'s') && !q.includes('whats')) {
        // Only handle if it's clearly asking about events, not asking "what is today"
        if (q.includes('events') || q.includes('event') || q.includes('happening')) {
            const todayEvents = await getEventsByDate('today');
            
            if (todayEvents.length > 0) {
                // Format dates for display
                const eventsWithDates = todayEvents.map(event => {
                    let dateStr = event.event_details?.event_date || 'N/A';
                    // Clean the date (replace "th" with actual date if needed)
                    dateStr = cleanDateString(dateStr, event);
                    const eventName = event.event_details?.event_name || 'Event';
                    return `- ${eventName} on ${dateStr}`;
                }).join('\n');
                
                return {
                    answer: `I found ${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} happening today! 📅\n\n${eventsWithDates}`,
                    sources: todayEvents
                };
            } else {
                return {
                    answer: `I couldn't find any events happening today. Would you like to see upcoming events instead?`,
                    sources: todayEvents
                };
            }
        }
    }

    // Check for "upcoming events" FIRST - should check ALL future events, not just this week
    // Matches: "upcoming events", "upcoming event", "any upcoming event", "any upcoming events", etc.
    // This must be checked BEFORE "this week" to avoid conflicts
    // Use regex to match more flexibly (handles variations like "any upcoming events?")
    const upcomingPattern = /(?:any\s+)?upcoming\s+events?/i;
    const hasUpcomingKeyword = q.includes('upcoming');
    const hasEventKeywordForUpcoming = q.includes('event');
    const hasAnyKeyword = q.includes('any');
    
    if (upcomingPattern.test(q) || (hasUpcomingKeyword && (hasEventKeywordForUpcoming || hasAnyKeyword))) {
        console.log(`[Intent Detection] Detected "upcoming events" query: "${question}" (normalized: "${q}")`);
        const upcomingEvents = await getEventsByDate('future');
        console.log(`[Intent Detection] Found ${upcomingEvents.length} upcoming events`);
        
        if (upcomingEvents.length > 0) {
            // Format dates for display
            const eventsWithDates = upcomingEvents.map(event => {
                let dateStr = event.event_details?.event_date || 'N/A';
                // Clean the date (replace "th" with actual date if needed)
                dateStr = cleanDateString(dateStr, event);
                const eventName = event.event_details?.event_name || 'Event';
                return `- ${eventName} on ${dateStr}`;
            }).join('\n');
            
            return {
                answer: `I found ${upcomingEvents.length} upcoming event${upcomingEvents.length !== 1 ? 's' : ''}! 📅\n\n${eventsWithDates}`,
                sources: upcomingEvents
            };
        } else {
            return {
                answer: `I couldn't find any upcoming events. Would you like to see all available events?`,
                sources: upcomingEvents
            };
        }
    }

    // Check for "this week" (more specific, but after upcoming events check)
    if (q.includes('this week') || (q.includes('week') && !q.includes('upcoming'))) {
        const weekEvents = await getEventsByDate('week');
        
        if (weekEvents.length > 0) {
            // Format dates for display
            const eventsWithDates = weekEvents.map(event => {
                let dateStr = event.event_details?.event_date || 'N/A';
                // Clean the date (replace "th" with actual date if needed)
                dateStr = cleanDateString(dateStr, event);
                const eventName = event.event_details?.event_name || 'Event';
                return `- ${eventName} on ${dateStr}`;
            }).join('\n');
            
            return {
                answer: `I found ${weekEvents.length} event${weekEvents.length !== 1 ? 's' : ''} happening this week! 📅\n\n${eventsWithDates}`,
                sources: weekEvents
            };
        } else {
            return {
                answer: `I couldn't find any events this week. Would you like to see all available events?`,
                sources: weekEvents
            };
        }
    }

    if (q.includes('tomorrow') || q.includes('events tomorrow')) {
        const tomorrowEvents = await getEventsByDate('tomorrow');
        
        if (tomorrowEvents.length > 0) {
            // Format dates for display
            const eventsWithDates = tomorrowEvents.map(event => {
                let dateStr = event.event_details?.event_date || 'N/A';
                // Clean the date (replace "th" with actual date if needed)
                dateStr = cleanDateString(dateStr, event);
                const eventName = event.event_details?.event_name || 'Event';
                return `- ${eventName} on ${dateStr}`;
            }).join('\n');
            
            return {
                answer: `I found ${tomorrowEvents.length} event${tomorrowEvents.length !== 1 ? 's' : ''} happening tomorrow! 📅\n\n${eventsWithDates}`,
                sources: tomorrowEvents
            };
        } else {
            return {
                answer: `I couldn't find any events tomorrow. Would you like to see today's events instead?`,
                sources: tomorrowEvents
            };
        }
    }

    // 2.6. FREE EVENTS INTENT - Check for free events queries
    if (q.includes('free') && (q.includes('event') || q.includes('events'))) {
        console.log("[Intent] Detected 'free events' query");
        const db = getEventsDB();
        const eventsCollection = db.collection('events');
        
        // Search for events with "free" in entry_type or other fields
        const freeEvents = await eventsCollection.find({
            $or: [
                { "event_details.entry_type": /free/i },
                { "event_details.event_name": /free/i },
                { "raw_ocr": /free/i },
                { "full_text": /free/i }
            ]
        }).limit(100).toArray();
        
        // Also filter results to ensure entry_type actually contains "free"
        const actualFreeEvents = freeEvents.filter(event => {
            const entryType = (event.event_details?.entry_type || '').toLowerCase();
            return entryType.includes('free') || entryType.includes('free entry');
        });
        
        console.log(`[Free Events] Found ${actualFreeEvents.length} free events`);
        
        if (actualFreeEvents.length > 0) {
            // Format dates for display
            const eventsWithDates = actualFreeEvents.map(event => {
                let dateStr = event.event_details?.event_date || 'N/A';
                dateStr = cleanDateString(dateStr, event);
                const eventName = event.event_details?.event_name || 'Event';
                const entryType = event.event_details?.entry_type || 'N/A';
                return `- ${eventName} on ${dateStr} (${entryType})`;
            }).join('\n');
            
            return {
                answer: `I found ${actualFreeEvents.length} free event${actualFreeEvents.length !== 1 ? 's' : ''}! 🎉\n\n${eventsWithDates}`,
                sources: actualFreeEvents
            };
        } else {
            return {
                answer: `I couldn't find any free events right now. Would you like to see all available events instead?`,
                sources: []
            };
        }
    }

    // 3. HELP INTENT - Expanded to catch more variations
    if (q.includes('help') || 
        q.includes('what can you do') || 
        q.includes('what do you do') ||
        q.includes('what u do') ||
        q.includes('what can u do') ||
        q.match(/what.*do/) ||
        q.match(/what.*can/) ||
        q === 'what u do' ||
        q === 'what do you do' ||
        q === 'what can you do') {
        return {
            answer: "I'm here to help you discover events! 🕵️‍♂️\n\nYou can ask me things like:\n- 'Show me upcoming music festivals'\n- 'Are there any free events?'\n- 'What's happening in Borcelle?'",
            sources: []
        };
    }

    // 4. WHAT IS A-AGENT / WHO ARE YOU INTENT
    if (q.includes('what is a-agent') || 
        q.includes('what is aagent') ||
        q.includes('what is a agent') ||
        q.includes('who are you') ||
        q.includes('who is a-agent') ||
        q.includes('who is aagent') ||
        q.includes('tell me about a-agent') ||
        q.includes('tell me about aagent') ||
        (q.includes('what') && q.includes('a-agent')) ||
        (q.includes('what') && q.includes('aagent')) ||
        q.includes('what is h-bot') || 
        q.includes('what is hbot') ||
        q.includes('what is h bot') ||
        q.includes('who is h-bot') ||
        q.includes('who is hbot') ||
        q.includes('tell me about h-bot') ||
        q.includes('tell me about hbot') ||
        (q.includes('what') && q.includes('h-bot')) ||
        (q.includes('what') && q.includes('hbot'))) {
        return {
            answer: "I'm A-Agent! 🤖 A-Agent is an AI assistant designed to help you discover events and information in Hyderabad. I can help you find events, venues, timings, and answer questions about what's happening in the city! 😊",
            sources: []
        };
    }

    return null; // No specific intent matched
};


/**
 * Generate embedding for a given text using Eden AI.
 */
const generateEmbedding = async (text) => {
    try {
        const response = await fetch(`${CONFIG.baseUrl}/text/embeddings`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                providers: CONFIG.embeddingProvider,
                texts: [text],
                [CONFIG.embeddingProvider]: CONFIG.embeddingModel
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("[Eden AI Embedding Error Body]:", JSON.stringify(data, null, 2));
            throw new Error(`Eden AI Embedding HTTP ${response.status}: ${data.error || 'Check logs'}`);
        }

        const providerKey = Object.keys(data).find(key => data[key]?.status === 'success');
        const providerData = data[providerKey];

        if (providerData && providerData.items?.length > 0) {
            return providerData.items[0].embedding;
        }

        throw new Error(`Invalid embedding format from Eden AI: ${JSON.stringify(data)}`);
    } catch (error) {
        console.error("[AI Error] Could not generate embedding:", error.message);
        return null; // Return null so we can fallback to normal search
    }
};

/**
 * Helper function to calculate event quality score
 * Returns a score from 0-100 based on how complete the event data is
 */
const calculateEventQuality = (event) => {
    const details = event.event_details || {};
    let score = 0;

    // Check event name - reject very short or generic names
    const eventName = (details.event_name || '').trim();
    if (eventName && eventName !== 'N/A' && eventName.length > 0) {
        // Penalize very short names (like "THE", "WOODRUFF")
        if (eventName.length <= 3 && !eventName.match(/^[A-Z]{2,3}$/)) {
            score -= 20; // Heavy penalty for generic short names
        }
        // Only add points if name is meaningful (more than 3 chars or is a proper acronym)
        if (eventName.length > 3 || eventName.match(/^[A-Z]{2,4}$/)) {
            score += 30;
        }
    }
    
    if (details.event_date && details.event_date !== 'N/A' && details.event_date.trim().length > 0) score += 25;
    if (details.location && details.location !== 'N/A' && details.location.trim().length > 0) score += 20;
    if (details.event_time && details.event_time !== 'N/A' && details.event_time.trim().length > 0) score += 10;
    if (details.organizer && details.organizer !== 'N/A' && details.organizer.trim().length > 0) score += 10;
    if (details.website && details.website !== 'N/A' && details.website.trim().length > 0) score += 5;

    return Math.max(0, score); // Don't return negative scores
};

/**
 * Perform Vector Search in MongoDB Atlas with Fallback
 */
const retrieveRelevantEvents = async (queryEmbedding, queryText, limit = 20) => {
    try {
        let vectorResults = [];
        let keywordResults = [];

        // 1. Vector Search (if embedding exists)
        if (queryEmbedding) {
            try {
                const db = getEventsDB();
                const eventsCollection = db.collection('events');
                vectorResults = await eventsCollection.aggregate([
                    {
                        $vectorSearch: {
                            index: "vector_index",
                            path: "embedding",
                            queryVector: queryEmbedding,
                            numCandidates: 100,
                            limit: limit * 2 // Get more candidates for filtering
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            event_details: 1,
                            raw_ocr: 1,
                            timestamp: 1,
                            score: { $meta: "vectorSearchScore" }
                        }
                    }
                ]).toArray();
            } catch (err) {
                console.warn("[Search Warning] Vector search failed (likely missing index). Ignoring vector results.", err.message);
            }
        }

        // 2. Keyword Search (Regex) - Fallback for when Vector Search fails or is insufficient
        if (queryText) {
            // "Smart" Keyword Extraction: Remove stop words to find core terms
            const stopWords = ['show', 'me', 'any', 'event', 'events', 'of', 'in', 'for', 'the', 'a', 'an', 'find', 'search', 'about', 'is', 'are', 'which', 'what', 'when', 'where'];
            const tokens = queryText.toLowerCase().split(/[\s,.?!]+/); // Split by space or punctuation
            const keywords = tokens.filter(t => t.length > 2 && !stopWords.includes(t));

            // If we extracted valid keywords, search for ANY of them (broad match)
            if (keywords.length > 0) {
                const keywordConditions = keywords.map(kw => {
                    const regex = new RegExp(kw, 'i');
                    return [
                        { "event_details.event_name": regex },
                        { "event_details.organizer": regex },
                        { "event_details.location": regex },
                        { "event_details.event_date": regex },
                        { "event_details.entry_type": regex }, // Search in entry_type (for "free", "paid", etc.)
                        { "event_details.highlights": regex }, // Search in highlights array
                        { "raw_ocr": regex } // Search in raw_ocr array (MongoDB will search array elements)
                    ];
                }).flat();

                // Get database and collection reference
                const db = getEventsDB();
                const eventsCollection = db.collection('events');
                
                // Check total documents in collection
                const totalCount = await eventsCollection.countDocuments();
                console.log(`[DB Check] Total documents in "events" collection: ${totalCount}`);
                
                keywordResults = await eventsCollection.find({
                    $or: keywordConditions
                }).limit(limit * 2).toArray(); // Get more candidates for filtering

                console.log(`[Smart Search] Keywords: [${keywords.join(', ')}] -> Found ${keywordResults.length} raw matches.`);
                
                // If no results, try a broader search without stop word filtering
                if (keywordResults.length === 0 && queryText.length > 0) {
                    console.log(`[Fallback Search] Trying broader search for: "${queryText}"`);
                    const broadRegex = new RegExp(queryText.replace(/[^\w\s]/g, ''), 'i');
                    keywordResults = await eventsCollection.find({
                        $or: [
                            { "event_details.event_name": broadRegex },
                            { "event_details.organizer": broadRegex },
                            { "event_details.location": broadRegex },
                            { "event_details.entry_type": broadRegex }, // Search in entry_type
                            { "event_details.highlights": broadRegex },
                            { "raw_ocr": broadRegex }
                        ]
                    }).limit(limit * 2).toArray();
                    console.log(`[Fallback Search] Found ${keywordResults.length} results with broader search`);
                }
            } else {
                // Determine if we should fallback to the original whole-phrase search
                // (Useful if the user searched for something very short or specific that was filtered out)
                // OR if query contains "event" but no keywords were extracted
                const db = getEventsDB();
                const eventsCollection = db.collection('events');
                
                // If query is just about events in general (like "popular events", "show events"), return all events
                if (queryText.toLowerCase().match(/(popular|show|all|any|latest|upcoming)\s+events?/i)) {
                    console.log(`[Smart Search] General events query detected, returning all events`);
                    keywordResults = await eventsCollection.find({})
                        .sort({ _id: -1 })
                        .limit(limit * 2)
                        .toArray();
                } else {
                    // Otherwise do regex search
                    const searchRegex = new RegExp(queryText, 'i');
                    keywordResults = await eventsCollection.find({
                        $or: [
                            { "event_details.event_name": searchRegex },
                            { "event_details.organizer": searchRegex },
                            { "event_details.location": searchRegex },
                            { "event_details.event_date": searchRegex },
                            { "event_details.entry_type": searchRegex }, // Search in entry_type
                            { "event_details.highlights": searchRegex },
                            { "raw_ocr": searchRegex }
                        ]
                    }).limit(limit * 2).toArray();
                }
            }
        }

        // 3. Merge and Deduplicate by ID and name
        const allResults = [...vectorResults, ...keywordResults];
        const uniqueResults = [];
        const seenIds = new Set();
        const seenNames = new Set();

        for (const result of allResults) {
            const idStr = result._id.toString();
            const eventName = (result.event_details?.event_name || '').toLowerCase().trim();
            
            // Skip if we've seen this ID before
            if (seenIds.has(idStr)) {
                continue;
            }
            
            // Skip if event name is too short or generic (like "THE", "WOODRUFF" without context)
            if (eventName.length <= 3 && !eventName.match(/^[a-z]{3,}$/)) {
                continue;
            }
            
            // Skip duplicates with same normalized name
            const normalizedName = eventName.replace(/[^a-z0-9]/g, '');
            if (normalizedName && seenNames.has(normalizedName)) {
                continue;
            }
            
            seenIds.add(idStr);
            if (normalizedName) {
                seenNames.add(normalizedName);
            }
            uniqueResults.push(result);
        }

        // 4. Filter by quality - only keep events with quality score >= 50
        // This ensures we have meaningful event names (not just "THE" or single words)
        // BUT: If we have many results, be less strict to avoid filtering out all events
        const qualityFiltered = uniqueResults.filter(event => {
            const quality = calculateEventQuality(event);
            const eventName = (event.event_details?.event_name || '').trim();
            // Additional check: reject events with names that are too short or generic
            if (eventName.length <= 3 && !eventName.match(/^[A-Z]{2,3}$/)) {
                return false;
            }
            // Use lower threshold if we have many results (might be a general query like "popular events")
            const threshold = uniqueResults.length > 20 ? 30 : 50;
            return quality >= threshold;
        });

        console.log(`[Quality Filter] ${uniqueResults.length} unique results -> ${qualityFiltered.length} quality events`);
        
        // If quality filter is too strict and we have no results, try a more lenient filter
        if (qualityFiltered.length === 0 && uniqueResults.length > 0) {
            console.log("[Quality Filter] No events passed strict filter, trying lenient filter (score >= 20)");
            const lenientFiltered = uniqueResults.filter(event => {
                const quality = calculateEventQuality(event);
                const eventName = (event.event_details?.event_name || '').trim();
                // Still reject very short names, but be more lenient
                if (eventName.length <= 1) {
                    return false;
                }
                return quality >= 20; // Very lenient threshold to get any events
            });
            
            if (lenientFiltered.length > 0) {
                console.log(`[Quality Filter] Lenient filter found ${lenientFiltered.length} events`);
                lenientFiltered.sort((a, b) => calculateEventQuality(b) - calculateEventQuality(a));
                return lenientFiltered.slice(0, limit);
            }
        }
        
        // If still no results but we had raw matches, return at least some events (even if low quality)
        if (qualityFiltered.length === 0 && uniqueResults.length > 0) {
            console.log("[Quality Filter] Still no results after lenient filter, returning top results anyway");
            uniqueResults.sort((a, b) => calculateEventQuality(b) - calculateEventQuality(a));
            return uniqueResults.slice(0, Math.min(limit, uniqueResults.length));
        }

        // 5. Sort by quality score (higher is better)
        qualityFiltered.sort((a, b) => calculateEventQuality(b) - calculateEventQuality(a));

        // 6. Limit final set
        const finalResults = qualityFiltered.slice(0, limit);

        // If we have no quality results but had unique results, return at least some
        if (finalResults.length === 0 && uniqueResults.length > 0) {
            console.log("[Final Filter] No quality results, but returning unique results anyway");
            uniqueResults.sort((a, b) => calculateEventQuality(b) - calculateEventQuality(a));
            return uniqueResults.slice(0, Math.min(limit, uniqueResults.length));
        }

        // If we have no quality results, return empty array instead of low-quality events
        return finalResults.length > 0 ? finalResults : [];

    } catch (error) {
        console.warn("[Search Warning] Retrieval failed:", error.message);
        return [];
    }
};

/**
 * Check if the query is asking about events specifically
 */
const isEventQuery = (question) => {
    const q = question.toLowerCase().trim();
    
    // Event-related keywords
    const eventKeywords = [
        'event', 'events', 'festival', 'festivals', 'concert', 'concerts',
        'show', 'shows', 'party', 'parties', 'meetup', 'meetups',
        'happening', 'happenings', 'activity', 'activities',
        'find', 'search', 'show me', 'tell me about', 'what events',
        'upcoming', 'today', 'tomorrow', 'this week', 'weekend',
        'venue', 'location', 'where', 'when', 'date', 'time',
        'music', 'sports', 'art', 'theater', 'comedy', 'dance',
        'stadium', 'cafe', 'hall', 'center', 'theater'
    ];
    
    // Check if question contains event-related keywords
    const hasEventKeywordInQuery = eventKeywords.some(keyword => q.includes(keyword));
    
    // Check if it's asking to find/show/list something (likely events)
    const isSearchQuery = /^(find|search|show|list|tell me|what|which|are there|do you have)/i.test(q);
    
    // Exclude general greetings and casual chat
    const isGeneralChat = /^(hi|hello|hey|hii|greetings|good morning|good evening|good afternoon|sup|what's up|wassup|yo|namaste|namaskar|how are you|how do you do)/i.test(q);
    
    return (hasEventKeywordInQuery || (isSearchQuery && q.length > 10)) && !isGeneralChat;
};

/**
 * Helper function to detect if a question is a follow-up question
 */
const isFollowUpQuestion = (question, conversationHistory = []) => {
    const q = question.toLowerCase().trim();

    // If the question is very short (1-3 words) and there's conversation history, likely a follow-up
    const wordCount = q.split(/\s+/).length;
    if (wordCount <= 3 && conversationHistory.length > 0) {
        // Check if it contains question-like words or detail-seeking words
        const detailWords = ['date', 'time', 'location', 'place', 'contact', 'number', 'phone', 'email',
            'website', 'address', 'price', 'cost', 'when', 'where', 'who', 'what',
            'which', 'how', 'their', 'they', 'its', 'the'];
        const hasDetailWord = detailWords.some(word => q.includes(word));
        if (hasDetailWord) {
            console.log(`[Follow-up Detection] Short question with detail word: "${question}"`);
            return true;
        }
    }

    // Check if question references an event from conversation history
    // Look for event names or locations mentioned in previous messages
    if (conversationHistory.length > 0) {
        const recentMessages = conversationHistory.slice(-6).map(msg => msg.content.toLowerCase()).join(' ');
        const eventKeywords = ['event', 'festival', 'concert', 'show', 'stadium', 'venue', 'location', 'uppal', 'holi', 'colour'];
        const hasEventReference = eventKeywords.some(keyword => recentMessages.includes(keyword));
        
        // If question asks about something and there's an event in recent history, likely a follow-up
        const isAskingAboutEvent = (
            q.includes('tell me more') ||
            q.includes('more about') ||
            q.includes('about the') ||
            q.includes('about this') ||
            q.includes('about that') ||
            q.includes('about') ||
            q.match(/^(tell|give|show|what).*(more|details|info|about)/i)
        );
        
        if (hasEventReference && isAskingAboutEvent) {
            console.log(`[Follow-up Detection] Question references event from history: "${question}"`);
            return true;
        }
    }

    // Common follow-up patterns
    const followUpPatterns = [
        // Standard question patterns
        /^(which|what|when|where|who|whose)\s+(date|time|location|place|contact|number|price|cost|website|email|phone|name)/i,

        // "the X" patterns
        /^(the\s+)?(date|time|location|place|contact|number|price|cost|website|email|phone|address|name)/i,

        // "What is the X" patterns - very common for follow-ups
        /^what\s+(is|are)\s+(the\s+)?(event\s+)?(name|date|time|location|place|contact|organizer|website)/i,
        /^what\s+(is|are)\s+(the\s+)?(name|date|time|location|place|contact|organizer|website)\s+(of\s+)?(the\s+)?(event)?/i,

        // Possessive patterns (their, its, his, her)
        /^(their|its|his|her|they)\s+/i,

        // Direct detail words at start
        /^(contact|phone|email|website|address|price|cost|date|time|location|place|name|organizer)/i,

        // How questions
        /^(how much|how long|how many|how far)/i,

        // "X number" or "X details" patterns
        /(contact|phone)\s*(number|details|info)?$/i,

        // Very short contextual questions
        /^(when|where|who|what time|what date|what name)/i,

        // "Tell me more" patterns
        /^(tell|give|show).*(more|details|info|about)/i,
        /more\s+about/i,
        /about\s+(the|this|that|it)/i
    ];

    const isFollowUp = followUpPatterns.some(pattern => pattern.test(q));

    if (isFollowUp) {
        console.log(`[Follow-up Detection] Pattern matched: "${question}"`);
    }

    return isFollowUp;
};

/**
 * Extract event sources from conversation history
 */
const extractEventsFromHistory = (conversationHistory) => {
    // Look for the last AI message that might have included event sources
    // In a real implementation, we'd need to store sources with messages
    // For now, we'll return empty array and rely on the AI's memory
    return [];
};

/**
 * Smart fallback: Extract answer from conversation history for follow-up questions
 */
const extractAnswerFromHistory = (question, conversationHistory) => {
    if (!conversationHistory || conversationHistory.length < 2) {
        console.log("[Fallback] No conversation history available");
        return null;
    }

    const q = question.toLowerCase().trim();
    console.log(`[Fallback] Looking for answer to: "${q}"`);
    console.log(`[Fallback] Conversation history has ${conversationHistory.length} messages`);
    
    // FIRST: Check if previous messages have sources (events) - use those directly
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if (msg.role === 'ai' && msg.sources && msg.sources.length > 0) {
            console.log(`[Fallback] Found AI message with ${msg.sources.length} event source(s)`);
            const event = msg.sources[0]; // Use first event from sources
            const details = event.event_details || {};
            
            // Extract event name
            if (q.includes('name') && (q.includes('event') || q.includes('what'))) {
                const eventName = details.event_name || 'N/A';
                if (eventName !== 'N/A') {
                    console.log(`[Fallback] Extracted event name from sources: "${eventName}"`);
                    return `The event name is ${eventName}.`;
                }
            }
            
            // Extract organizer
            if (q.includes('organizer') || (q.includes('who') && q.includes('organize'))) {
                const organizer = details.organizer || 'N/A';
                if (organizer !== 'N/A') {
                    console.log(`[Fallback] Extracted organizer from sources: "${organizer}"`);
                    return `The event is organized by ${organizer}.`;
                }
            }
            
            // Extract date
            if (q.includes('date') || (q.includes('when') && !q.includes('time'))) {
                const eventDate = details.event_date || 'N/A';
                if (eventDate !== 'N/A') {
                    console.log(`[Fallback] Extracted date from sources: "${eventDate}"`);
                    return `The event is on ${eventDate}.`;
                }
            }
            
            // Extract time
            if (q.includes('time') || (q.includes('when') && q.includes('time'))) {
                const eventTime = details.event_time || 'N/A';
                if (eventTime !== 'N/A') {
                    console.log(`[Fallback] Extracted time from sources: "${eventTime}"`);
                    return `The event time is ${eventTime}.`;
                }
            }
            
            // Extract location
            if (q.includes('location') || q.includes('where') || q.includes('venue') || q.includes('place')) {
                let location = details.location || 'N/A';
                // Clean location - replace "N/A" with first two words of original address
                location = cleanLocationString(location, event);
                if (location !== 'N/A' && location.trim() !== '') {
                    console.log(`[Fallback] Extracted location from sources: "${location}"`);
                    return `The event is happening at ${location}.`;
                }
            }
            
            // Extract website
            if (q.includes('website') || q.includes('url') || q.includes('link')) {
                const website = details.website || 'N/A';
                if (website !== 'N/A') {
                    console.log(`[Fallback] Extracted website from sources: "${website}"`);
                    return `The event website is ${website}.`;
                }
            }
            
            // Extract entry type
            if (q.includes('entry') || q.includes('ticket') || q.includes('price') || q.includes('cost') || q.includes('free')) {
                const entryType = details.entry_type || 'N/A';
                if (entryType !== 'N/A') {
                    console.log(`[Fallback] Extracted entry type from sources: "${entryType}"`);
                    return `The event entry is ${entryType}.`;
                }
            }
        }
    }
    
    // SECOND: Look for the most recent AI message that mentioned events (fallback to text extraction)
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if (msg.role === 'ai' && msg.content) {
            const content = msg.content;
            const contentLower = content.toLowerCase();
            console.log(`[Fallback] Checking AI message ${i}: "${content.substring(0, 100)}..."`);
            
            // Check if this message contains location information
            if (content.includes('at ') || content.includes('At ')) {
                console.log(`[Fallback] Found message with 'at': "${content}"`);
            }
            
            // For "tell me about that" or "tell about that" or "can u tell about that" - return the full previous response
            // Also handle variations like "can u tell", "tell me", "tell about"
            const tellPatterns = [
                /tell.*about/i,
                /tell.*that/i,
                /tell.*it/i,
                /tell.*this/i,
                /say.*about/i,
                /can.*tell/i,
                /could.*tell/i
            ];
            
            const hasTellPattern = tellPatterns.some(pattern => pattern.test(q));
            const hasAboutThat = q.includes('about') || q.includes('that') || q.includes('it') || q.includes('this');
            
            if ((q.includes('tell') || q.includes('say') || hasTellPattern) && hasAboutThat) {
                // Return the full previous AI response about the event
                // This gives the user all the details that were previously mentioned
                if (content.length > 30) {
                    console.log("[Fallback] Returning previous AI response for 'tell about' question");
                    return content; // Return the full previous response about the event
                }
            }
            
            // Extract time information
            if (q.includes('time') || (q.includes('when') && !q.includes('date'))) {
                // Look for time patterns in the AI's previous response
                const timePatterns = [
                    /(\d{1,2}\s*(?:am|pm|AM|PM)\s*(?:to|-)?\s*\d{1,2}\s*(?:am|pm|AM|PM))/i,
                    /(\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?\s*(?:to|-)?\s*\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?)/i,
                    /(\d{1,2}\s*(?:pm|PM|am|AM)\s*to\s*\d{1,2}\s*(?:pm|PM|am|AM))/i,
                    /from\s*(\d{1,2}\s*(?:am|pm|AM|PM)|\d{1,2}:\d{2})\s*to\s*(\d{1,2}\s*(?:am|pm|AM|PM)|\d{1,2}:\d{2})/i
                ];
                
                for (const pattern of timePatterns) {
                    const timeMatch = content.match(pattern);
                    if (timeMatch) {
                        return `The event is scheduled ${timeMatch[0]}.`;
                    }
                }
            }
            
            // Extract contact information
            if (q.includes('contact') || (q.includes('who') && q.includes('contact')) || q.includes('organizer')) {
                const contactPatterns = [
                    /contact.*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
                    /email.*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
                    /phone.*?(\d{10,})/i,
                    /call.*?(\d{10,})/i
                ];
                
                for (const pattern of contactPatterns) {
                    const contactMatch = content.match(pattern);
                    if (contactMatch) {
                        return `You can contact them at ${contactMatch[1]}.`;
                    }
                }
            }
            
            // Extract location
            if (q.includes('where') || q.includes('location') || q.includes('venue') || q.includes('place')) {
                const locationPatterns = [
                    // "at Elements Cafe" - case insensitive, more flexible
                    /\bat\s+([A-Za-z][A-Za-z\s]+)/i,
                    // "happening at Elements Cafe"
                    /happening\s+(?:at|in)\s+([A-Za-z][A-Za-z\s]+)/i,
                    // "located at", "takes place at"
                    /(?:located|takes place)\s+(?:at|in)\s+([A-Za-z][A-Za-z\s]+)/i,
                    // "venue:", "location:"
                    /(?:venue|location|place):\s*([A-Za-z][A-Za-z\s]+)/i,
                    // "at [Location Name]" with venue types - case insensitive
                    /(?:at|venue|location|place)\s+([A-Za-z][A-Za-z\s]*(?:cafe|stadium|hall|center|theater|park|venue|arena|auditorium|ground|hotel|restaurant|club|bar|studio|gallery|mall|plaza|square|garden|beach|resort|academy|institute|school|college|university|library|museum|theatre|cinema|field|grounds?))/i
                ];
                
                for (let j = 0; j < locationPatterns.length; j++) {
                    const pattern = locationPatterns[j];
                    const locationMatch = content.match(pattern);
                    console.log(`[Fallback] Pattern ${j}: ${pattern} -> Match: ${locationMatch ? locationMatch[1] : 'none'}`);
                    
                    if (locationMatch && locationMatch[1]) {
                        let location = locationMatch[1].trim();
                        // Clean up trailing punctuation and extra words
                        location = location.replace(/[.,!?;:]+.*$/, '').trim();
                        location = location.split(/[.,!?]/)[0].trim();
                        
                        // Make sure it's not too short and looks like a location
                        const skipWords = ['the', 'a', 'an', 'at', 'in', 'on', 'for', 'to', 'from', 'and', 'or', 'but', 'it', 'is', 'was', 'are', 'were'];
                        const locationLower = location.toLowerCase();
                        
                        if (location.length > 2 && !skipWords.includes(locationLower)) {
                            console.log(`[Fallback] Extracted location (pattern ${j}): "${location}"`);
                            return `The event is happening at ${location}.`;
                        }
                    }
                }
                
                // Fallback: Look for capitalized words after "at" that might be locations
                // This pattern specifically looks for "at [Capitalized Word] [Capitalized Word]"
                const atLocationMatch = content.match(/\bat\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
                if (atLocationMatch && atLocationMatch[1]) {
                    let location = atLocationMatch[1].trim();
                    location = location.replace(/[.,!?;:]+$/, '').trim();
                    if (location.length > 3 && location.match(/^[A-Z]/)) {
                        console.log(`[Fallback] Extracted location (broad match): "${location}"`);
                        return `The event is happening at ${location}.`;
                    }
                }
                
                // Additional fallback: Look for any capitalized phrase after "at"
                const simpleAtMatch = content.match(/\bat\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/);
                if (simpleAtMatch && simpleAtMatch[1]) {
                    let location = simpleAtMatch[1].trim();
                    location = location.replace(/[.,!?;:]+$/, '').trim();
                    // Stop at common sentence endings
                    location = location.split(/[.,!?]/)[0].trim();
                    if (location.length > 3 && location.match(/^[A-Z]/)) {
                        console.log(`[Fallback] Extracted location (simple match): "${location}"`);
                        return `The event is happening at ${location}.`;
                    }
                }
            }
            
            // Extract date
            if (q.includes('date') || (q.includes('when') && q.includes('date'))) {
                const datePatterns = [
                    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i,
                    /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
                    /on\s+(\w+\s+\d{1,2})/i
                ];
                
                for (const pattern of datePatterns) {
                    const dateMatch = content.match(pattern);
                    if (dateMatch) {
                        return `The event is on ${dateMatch[0]}.`;
                    }
                }
            }
        }
    }
    
    return null;
};

/**
 * Main chat logic: RAG approach using Eden AI
 */
const getChatResponse = async (question, conversationHistory = [], user = null) => {
    // Declare relevantEvents at function scope so it's accessible in catch block
    let relevantEvents = [];
    
    try {
        // -------------------------------------------------
        // 0. Check if we should ask for name (first interaction)
        // Skip if user is logged in (has displayName from Firebase)
        // -------------------------------------------------
        if (!user && shouldAskForName(conversationHistory)) {
            console.log("[Name Check] Asking for user's name");
            return {
                answer: "what is ur name",
                sources: []
            };
        }

        // -------------------------------------------------
        // 0.5. Check if user just provided their name
        // Skip if user is logged in (already has name from Firebase)
        // -------------------------------------------------
        if (!user && isNameResponse(conversationHistory)) {
            const userName = extractUserName(question);
            if (userName && userName.length > 0) {
                return {
                    answer: `Nice to meet you, ${userName}! 😊 Now, how can I help you with events today?`,
                    sources: []
                };
            }
        }

        // -------------------------------------------------
        // 1. Check Local Intents First (Dialogflow-like)
        // -------------------------------------------------
        const intentResult = await detectIntent(question, conversationHistory);
        if (intentResult) {
            console.log("[AI Service] ✓ Intent matched locally - returning early, NOT calling AI");
            console.log("[AI Service] Intent answer:", intentResult.answer);
            // If it's a greeting, personalize it with user name
            if (intentResult.sources && intentResult.sources.length === 0 && intentResult.answer) {
                const userName = user?.displayName || getUserName(conversationHistory);
                if (userName && intentResult.answer.includes('Hey there')) {
                    intentResult.answer = intentResult.answer.replace('Hey there', `Hey ${userName}`);
                }
            }
            return intentResult;
        } else {
            console.log("[AI Service] No intent matched - will proceed to AI/RAG");
        }

        // Get user name from Firebase auth or conversation history for personalization
        const userName = user?.displayName || getUserName(conversationHistory);

        // -------------------------------------------------
        // 2. Check if this is asking about events or just general conversation
        // -------------------------------------------------
        const isEventQueryResult = isEventQuery(question);
        const isFollowUp = isFollowUpQuestion(question, conversationHistory);

        // Only search for events if:
        // 1. User is explicitly asking about events (isEventQuery)
        // 2. OR it's a follow-up about events from previous conversation
        // 3. OR it matched an intent that requires events
        const shouldSearchEvents = isEventQueryResult || (isFollowUp && conversationHistory.length > 0 && conversationHistory.some(msg => msg.sources && msg.sources.length > 0));

        // FIRST: Check if we can answer from conversation history (for follow-ups)
        if (isFollowUp && conversationHistory.length > 0) {
            console.log("[AI Service] Detected follow-up question. Checking conversation history first...");
            const extractedAnswer = extractAnswerFromHistory(question, conversationHistory);
            if (extractedAnswer) {
                console.log("[AI Service] ✓ Found answer in conversation history, returning early");
                // Get events from previous messages for sources
                for (let i = conversationHistory.length - 1; i >= 0; i--) {
                    const msg = conversationHistory[i];
                    if (msg.role === 'ai' && msg.sources && msg.sources.length > 0) {
                        relevantEvents = msg.sources;
                        break;
                    }
                }
                return {
                    answer: extractedAnswer,
                    sources: relevantEvents
                };
            }
            // If no answer found, continue to use events from history
            console.log("[AI Service] No direct answer in history, will use events from conversation");
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const msg = conversationHistory[i];
                if (msg.role === 'ai' && msg.sources && msg.sources.length > 0) {
                    relevantEvents = msg.sources;
                    console.log(`[AI Service] Using ${relevantEvents.length} event(s) from conversation history`);
                    break;
                }
            }
        } else if (!shouldSearchEvents) {
            console.log("[AI Service] General conversation detected. Not searching for events.");
            relevantEvents = [];
        } else {
            // -------------------------------------------------
            // 3. Perform RAG (Embeddings + LLM) for event queries
            // -------------------------------------------------

            // Check if query contains date-related keywords but didn't match intent
            const q = question.toLowerCase();
            let dateFilteredEvents = [];
            
            if (q.includes('today') || q.includes('happening today')) {
                dateFilteredEvents = await getEventsByDate('today');
            } else if (q.includes('tomorrow')) {
                dateFilteredEvents = await getEventsByDate('tomorrow');
            } else if (q.includes('this week') || q.includes('week')) {
                dateFilteredEvents = await getEventsByDate('week');
            }

            // If we found date-filtered events, use them; otherwise do normal search
            if (dateFilteredEvents.length > 0) {
                relevantEvents = dateFilteredEvents;
                console.log(`[Date Filter] Found ${dateFilteredEvents.length} events for date query`);
            } else {
                // Generate Query Vector (Optional fallback)
                const queryEmbedding = await generateEmbedding(question);

                // Search Database (with fallback to basic retrieval)
                relevantEvents = await retrieveRelevantEvents(queryEmbedding, question);
            }
        }

        // 4. Prepare Context
        const eventsContext = formatEventsContext(relevantEvents);

        // 5. Build conversation context from history
        let conversationContext = '';
        if (conversationHistory && conversationHistory.length > 0) {
            // Take last 10 messages (5 turns) to keep more context
            const recentHistory = conversationHistory.slice(-10);
            conversationContext = '\n\n=== Previous Conversation ===\n' +
                recentHistory.map(msg => {
                    const role = msg.role === 'user' ? 'User' : 'A-Agent';
                    return `${role}: ${msg.content}`;
                }).join('\n') + '\n=== End of Previous Conversation ===\n';
        }

        // Add user name to context if available
        if (userName) {
            conversationContext += `\nNote: The user's name is ${userName}. You can use their name to personalize responses when appropriate.\n`;
        }

        // Build the complete system prompt with all context
        const fullSystemPrompt = SYSTEM_PROMPT.replace('{eventsContext}', eventsContext) + conversationContext;

        // 6. Generate Answer using Eden AI Chat
        try {
            const response = await fetch(`${CONFIG.baseUrl}/text/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    providers: CONFIG.chatProvider,
                    text: question,
                    chatbot_global_action: fullSystemPrompt,
                    temperature: 0.2,
                    max_tokens: 1500, // Increased to allow longer responses with context
                    [CONFIG.chatProvider]: CONFIG.llmModel
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("[Eden AI Chat Error Body]:", JSON.stringify(data, null, 2));
                throw new Error(`Eden AI Chat HTTP ${response.status}`);
            }

            const providerKey = Object.keys(data).find(key => data[key]?.status === 'success');
            const providerData = data[providerKey];

            if (providerData && providerData.status === 'success') {
                // Only return event sources if:
                // 1. We found relevant events AND
                // 2. User explicitly asked about events (not just general conversation)
                const shouldReturnSources = shouldSearchEvents && relevantEvents.length > 0 && !isFollowUp;
                
                return {
                    answer: providerData.generated_text,
                    sources: shouldReturnSources ? relevantEvents : [] // Only show event cards when explicitly asking about events
                };
            }
            
            // If no successful provider found, log and use fallback
            console.warn("[AI Service Warning] No successful provider found in Eden AI response:", JSON.stringify(data, null, 2));
            
            // For follow-up questions, try to extract answer from conversation history
            if (isFollowUp) {
                console.log("[Fallback] Attempting to extract answer from conversation history for:", question);
                const extractedAnswer = extractAnswerFromHistory(question, conversationHistory);
                if (extractedAnswer) {
                    console.log("[Fallback] Successfully extracted answer from history");
                    return {
                        answer: extractedAnswer,
                        sources: []
                    };
                } else {
                    console.log("[Fallback] Could not extract answer from history, using default message");
                }
            }
            
            // Fallback: Generate a simple response from events found (when AI is down)
            if (!isFollowUp && relevantEvents.length > 0) {
                // Generate a simple text response from the events
                const eventSummary = relevantEvents.slice(0, 3).map((event, idx) => {
                    const details = event.event_details || {};
                    const name = details.event_name || 'Event';
                    const date = details.event_date && details.event_date !== 'N/A' ? details.event_date : '';
                    let location = details.location && details.location !== 'N/A' ? details.location : '';
                    // Clean location - replace "N/A" with first two words of original address
                    if (!location || location === 'N/A') {
                        location = cleanLocationString('N/A', event);
                        if (location === 'N/A') location = '';
                    }
                    const time = details.event_time && details.event_time !== 'N/A' ? details.event_time : '';
                    
                    let summary = `${idx + 1}. ${name}`;
                    if (date) summary += ` on ${date}`;
                    if (time) summary += ` at ${time}`;
                    if (location) summary += ` at ${location}`;
                    
                    return summary;
                }).join('\n');
                
                return {
                    answer: `I found ${relevantEvents.length} event${relevantEvents.length !== 1 ? 's' : ''} related to your search! 📅\n\n${eventSummary}${relevantEvents.length > 3 ? `\n\n...and ${relevantEvents.length - 3} more event${relevantEvents.length - 3 !== 1 ? 's' : ''}!` : ''}`,
                    sources: relevantEvents
                };
            }
            
            // Fallback: Return events with a simple message
            return {
                answer: isFollowUp 
                    ? "I'm having a little trouble accessing that information right now. Could you try asking about the event details again?"
                    : relevantEvents.length > 0
                        ? `I found ${relevantEvents.length} event${relevantEvents.length !== 1 ? 's' : ''} related to your search! Here they are: 👇`
                        : "I couldn't find any events matching your search. Try different keywords!",
                sources: isFollowUp ? [] : relevantEvents
            };
        } catch (chatError) {
            console.warn("[AI Service Warning] Chat generation failed. Returning fallback response.", chatError.message);
            
            // For follow-up questions, try to extract answer from conversation history
            if (isFollowUp) {
                console.log("[Fallback] Attempting to extract answer from conversation history for:", question);
                const extractedAnswer = extractAnswerFromHistory(question, conversationHistory);
                if (extractedAnswer) {
                    console.log("[Fallback] Successfully extracted answer from history");
                    return {
                        answer: extractedAnswer,
                        sources: []
                    };
                } else {
                    console.log("[Fallback] Could not extract answer from history, using default message");
                }
            }
            
            // Fallback: Generate a simple response from events found (when AI is down)
            if (!isFollowUp && relevantEvents.length > 0) {
                // Generate a simple text response from the events
                const eventSummary = relevantEvents.slice(0, 3).map((event, idx) => {
                    const details = event.event_details || {};
                    const name = details.event_name || 'Event';
                    const date = details.event_date && details.event_date !== 'N/A' ? details.event_date : '';
                    let location = details.location && details.location !== 'N/A' ? details.location : '';
                    // Clean location - replace "N/A" with first two words of original address
                    if (!location || location === 'N/A') {
                        location = cleanLocationString('N/A', event);
                        if (location === 'N/A') location = '';
                    }
                    const time = details.event_time && details.event_time !== 'N/A' ? details.event_time : '';
                    
                    let summary = `${idx + 1}. ${name}`;
                    if (date) summary += ` on ${date}`;
                    if (time) summary += ` at ${time}`;
                    if (location) summary += ` at ${location}`;
                    
                    return summary;
                }).join('\n');
                
                return {
                    answer: `I found ${relevantEvents.length} event${relevantEvents.length !== 1 ? 's' : ''} related to your search! 📅\n\n${eventSummary}${relevantEvents.length > 3 ? `\n\n...and ${relevantEvents.length - 3} more event${relevantEvents.length - 3 !== 1 ? 's' : ''}!` : ''}`,
                    sources: relevantEvents
                };
            }
            
            // Fallback: If LLM fails, return the raw events with a simple message
            // But don't show events for follow-up questions
            return {
                answer: isFollowUp 
                    ? "I'm having a little trouble accessing that information right now. Could you try asking about the event details again?"
                    : relevantEvents.length > 0
                        ? `I found ${relevantEvents.length} event${relevantEvents.length !== 1 ? 's' : ''} related to your search! Here they are: 👇`
                        : "I couldn't find any events matching your search. Try different keywords!",
                sources: isFollowUp ? [] : relevantEvents
            };
        }
    } catch (error) {
        console.error("[AI Service Error]:", error.message);
        // Final Safety Net: If we have relevantEvents from earlier, use them
        // Otherwise fall back to standard search
        if (typeof relevantEvents !== 'undefined' && relevantEvents.length > 0) {
            return {
                answer: `I found ${relevantEvents.length} event${relevantEvents.length !== 1 ? 's' : ''} related to your search! Here they are: 👇`,
                sources: relevantEvents
            };
        }
        return await performStandardSearch(question);
    }
};

/**
 * Standard Text Search without AI
 * Uses regex to find matching events in the database.
 */
const performStandardSearch = async (query) => {
    try {
        console.log(`[Standard Search] Searching for: "${query}"`);

        // Create a case-insensitive regex for the search query
        const searchRegex = new RegExp(query, 'i');

        const db = getEventsDB();
        const eventsCollection = db.collection('events');
        const totalCount = await eventsCollection.countDocuments();
        console.log(`[Standard Search] Total documents in collection: ${totalCount}`);
        
        const results = await eventsCollection.find({
            $or: [
                { "event_details.event_name": searchRegex },
                { "event_details.organizer": searchRegex },
                { "event_details.location": searchRegex },
                { "event_details.highlights": searchRegex },
                { "raw_ocr": searchRegex } // MongoDB will search array elements
            ]
        }).limit(50).toArray();
        
        console.log(`[Standard Search] Found ${results.length} results for query: "${query}"`);

        return {
            answer: results.length > 0
                ? `Found ${results.length} events matching "${query}".`
                : `No events found matching "${query}".`,
            sources: results
        };
    } catch (error) {
        console.error("[Standard Search Error]:", error.message);
        throw error;
    }
};

module.exports = {
    getChatResponse,
    performStandardSearch
};
