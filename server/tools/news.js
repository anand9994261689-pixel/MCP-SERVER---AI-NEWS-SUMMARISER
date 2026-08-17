// Node 18+ has fetch built-in natively, so we use global fetch.

const CATEGORY_URLS = {
  all: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
  world: 'https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx1YlY4U0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en',
  technology: 'https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGRqTVhZU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en',
  business: 'https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx6TVdZU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en',
  science: 'https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRFp0Y1RjU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en',
  entertainment: 'https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNREpxYW5RU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en',
  sports: 'https://news.google.com/rss/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRFp1ZEdvU0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US:en'
};

function parseGoogleNewsRSS(xmlText) {
  const articles = [];
  // Find all <item> tags
  const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const match of itemMatches) {
    const itemContent = match[1];

    // Extraction helper
    const extractTag = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
      const tagMatch = itemContent.match(regex);
      return tagMatch ? tagMatch[1].trim() : '';
    };

    // Extract source
    const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? sourceMatch[1].trim() : 'Google News';

    let title = extractTag('title');
    let link = extractTag('link');
    const pubDate = extractTag('pubDate');
    const description = extractTag('description');

    // Clean title suffix: remove " - Source Name"
    if (title && source && title.endsWith(` - ${source}`)) {
      title = title.substring(0, title.length - (source.length + 3)).trim();
    }

    if (link) {
      link = link.replace(/&amp;/g, '&');
    }

    // HTML decode function
    const decodeHTML = (str) => {
      if (!str) return '';
      return str
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'); // Strip CDATA tags
    };

    // Clean description: strip HTML tags and CDATA.
    // Insert periods at tag boundaries (like </li> or </p> or <br>) to split concatenated articles into sentences!
    const cleanedDesc = decodeHTML(description)
      .replace(/<\/li>/gi, '. ')
      .replace(/<\/p>/gi, '. ')
      .replace(/<br\s*\/?>/gi, '. ')
      .replace(/<[^>]*>/g, '') // Strip HTML tags
      .replace(/\s+/g, ' ')
      .trim();

    articles.push({
      title: decodeHTML(title),
      link,
      pubDate,
      description: cleanedDesc || 'No summary available.',
      source: decodeHTML(source)
    });

    // Limit to top 15 high-quality articles for faster speed and clean layout
    if (articles.length >= 15) {
      break;
    }
  }

  return articles;
}

export default {
  name: 'news',
  description: 'Fetches the latest live news from Google News RSS based on a category selection, returning a structured list of articles.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['all', 'world', 'technology', 'business', 'science', 'entertainment', 'sports'],
        description: 'The news category to fetch (defaults to "all" for general news)'
      }
    }
  },

  async handler(args) {
    const category = args.category || 'all';
    const normalizedCategory = category.toLowerCase();
    const rssUrl = CATEGORY_URLS[normalizedCategory] || CATEGORY_URLS.all;

    try {
      console.log(`[MCP news] Fetching RSS feed from: ${rssUrl}`);
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Google News RSS returned status ${response.status}`);
      }

      const xmlText = await response.text();
      const articles = parseGoogleNewsRSS(xmlText);

      console.log(`[MCP news] Successfully parsed ${articles.length} articles for category: ${normalizedCategory}`);
      return {
        category: normalizedCategory,
        articles
      };
    } catch (error) {
      console.error("[MCP news] Fetch Error:", error.message);
      return {
        error: `Failed to fetch live news: ${error.message}`,
        articles: []
      };
    }
  }
};
