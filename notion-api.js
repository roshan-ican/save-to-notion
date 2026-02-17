const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DATABASE_SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;
const databaseSchemaCache = new Map();
const DEFAULT_PROPERTY_NAMES = {
  name: 'Name',
  difficulty: 'Difficulty',
  dateSolved: 'Date Solved',
  leetcodeUrl: 'LeetCode URL',
  tags: 'Tags',
  runtime: 'Runtime',
  space: 'Space',
  approach: 'Approach',
  platform: 'Platform'
};

// Split text into 2000-char chunks for Notion's rich_text limit
function chunkText(text, maxLen = 2000) {
  if (!text) return [{ type: 'text', text: { content: '' } }];
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push({
      type: 'text',
      text: { content: text.slice(i, i + maxLen) }
    });
  }
  return chunks;
}

// Strip HTML tags and decode entities to plain text
function htmlToPlainText(html) {
  if (!html) return '';
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// Convert HTML content to structured Notion blocks (using regex, no DOM parsing)
function htmlToNotionBlocks(html) {
  if (!html) return [];

  const blocks = [];

  // First, convert HTML to structured text with markers
  let text = html;

  // Extract code blocks first (to preserve them)
  const codeBlocks = [];
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, content) => {
    const cleanCode = content
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '$1')
      .replace(/<[^>]*>/g, '')
      .trim();
    codeBlocks.push(decodeHtmlEntities(cleanCode));
    return `{{CODE_BLOCK_${codeBlocks.length - 1}}}`;
  });

  // Extract list items
  const listItems = [];
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (match, content) => {
    const cleanItem = content.replace(/<[^>]*>/g, '').trim();
    if (cleanItem) {
      listItems.push(decodeHtmlEntities(cleanItem));
      return `{{LIST_ITEM_${listItems.length - 1}}}\n`;
    }
    return '';
  });

  // Remove list container tags
  text = text.replace(/<\/?[uo]l[^>]*>/gi, '');

  // Convert paragraphs and divs to double line breaks
  text = text
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // Now build blocks from the processed text
  const lines = text.split('\n');
  let currentParagraph = '';

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Handle code block markers
    if (trimmedLine.match(/{{CODE_BLOCK_(\d+)}}/)) {
      // Save any accumulated paragraph first
      if (currentParagraph) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: chunkText(currentParagraph.trim())
          }
        });
        currentParagraph = '';
      }

      const index = parseInt(trimmedLine.match(/{{CODE_BLOCK_(\d+)}}/)[1]);
      if (codeBlocks[index]) {
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: chunkText(codeBlocks[index]),
            language: 'plain text'
          }
        });
      }
    }
    // Handle list item markers
    else if (trimmedLine.match(/{{LIST_ITEM_(\d+)}}/)) {
      // Save any accumulated paragraph first
      if (currentParagraph) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: chunkText(currentParagraph.trim())
          }
        });
        currentParagraph = '';
      }

      const index = parseInt(trimmedLine.match(/{{LIST_ITEM_(\d+)}}/)[1]);
      if (listItems[index]) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: chunkText(listItems[index])
          }
        });
      }
    }
    // Empty line marks paragraph break
    else if (!trimmedLine) {
      if (currentParagraph) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: chunkText(currentParagraph.trim())
          }
        });
        currentParagraph = '';
      }
    }
    // Accumulate text for current paragraph
    else {
      if (currentParagraph) {
        currentParagraph += ' ' + trimmedLine;
      } else {
        currentParagraph = trimmedLine;
      }
    }
  }

  // Don't forget the last paragraph
  if (currentParagraph) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: chunkText(currentParagraph.trim())
      }
    });
  }

  // If no blocks were created, fall back to simple paragraph
  if (blocks.length === 0 && text.trim()) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: chunkText(text.trim())
      }
    });
  }

  return blocks;
}

// Decode HTML entities
function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

// Map LeetCode language IDs to Notion code block languages
function mapLanguage(lcLang) {
  const map = {
    'python': 'python', 'python3': 'python',
    'javascript': 'javascript', 'typescript': 'typescript',
    'java': 'java', 'cpp': 'c++', 'c': 'c',
    'csharp': 'c#', 'go': 'go', 'rust': 'rust',
    'ruby': 'ruby', 'swift': 'swift', 'kotlin': 'kotlin',
    'scala': 'scala', 'php': 'php', 'dart': 'dart',
    'sql': 'sql', 'mysql': 'sql', 'mssql': 'sql',
    'oraclesql': 'sql', 'postgresql': 'sql',
  };
  return map[lcLang?.toLowerCase()] || 'plain text';
}

// Build Notion database page properties
function buildProperties(data, propertyNames = DEFAULT_PROPERTY_NAMES) {
  const names = { ...DEFAULT_PROPERTY_NAMES, ...propertyNames };
  const props = {
    [names.name]: {
      title: [{
        type: 'text',
        text: {
          content: `${data.problem.questionFrontendId}. ${data.problem.title}`
        }
      }]
    },
    [names.difficulty]: {
      select: { name: data.problem.difficulty }
    },
    [names.dateSolved]: {
      date: { start: new Date().toISOString().split('T')[0] }
    },
    [names.leetcodeUrl]: {
      url: data.url
    }
  };

  if (data.problem.topicTags?.length > 0) {
    props[names.tags] = {
      multi_select: data.problem.topicTags.map(tag => ({ name: tag.name }))
    };
  }

  if (data.runtime) {
    props[names.runtime] = {
      rich_text: [{ type: 'text', text: { content: data.runtime } }]
    };
  }

  if (data.space) {
    props[names.space] = {
      rich_text: [{ type: 'text', text: { content: data.space } }]
    };
  }

  if (data.approach) {
    props[names.approach] = {
      select: { name: data.approach }
    };
  }

  if (data.platform) {
    props[names.platform] = {
      select: { name: data.platform }
    };
  }

  return props;
}

function buildCoreProperties(properties, requiredPropertyNames) {
  const core = {};

  for (const propertyName of requiredPropertyNames) {
    if (properties[propertyName]) {
      core[propertyName] = properties[propertyName];
    }
  }

  return core;
}

function findTitlePropertyName(schemaProperties) {
  if (schemaProperties[DEFAULT_PROPERTY_NAMES.name]?.type === 'title') {
    return DEFAULT_PROPERTY_NAMES.name;
  }

  for (const [propertyName, property] of Object.entries(schemaProperties)) {
    if (property?.type === 'title') {
      return propertyName;
    }
  }

  return null;
}

function filterPropertiesBySchema(properties, schemaProperties) {
  const filtered = {};

  for (const [name, value] of Object.entries(properties)) {
    if (schemaProperties[name]) {
      filtered[name] = value;
    }
  }

  return filtered;
}

async function getDatabaseSchemaProperties(accessToken, databaseId, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const cached = databaseSchemaCache.get(databaseId);
  const now = Date.now();
  if (!forceRefresh && cached && now - cached.timestamp < DATABASE_SCHEMA_CACHE_TTL_MS) {
    return cached.properties;
  }

  const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Notion API error: ${response.status}`);
  }

  const data = await response.json();
  const properties = data.properties || {};

  databaseSchemaCache.set(databaseId, {
    timestamp: now,
    properties
  });

  return properties;
}

async function addMissingRequiredProperties(accessToken, databaseId, missingPropertyNames) {
  const propertiesToAdd = {};

  if (missingPropertyNames.includes(DEFAULT_PROPERTY_NAMES.difficulty)) {
    propertiesToAdd[DEFAULT_PROPERTY_NAMES.difficulty] = {
      select: {
        options: [
          { name: 'Easy', color: 'green' },
          { name: 'Medium', color: 'yellow' },
          { name: 'Hard', color: 'red' }
        ]
      }
    };
  }

  if (missingPropertyNames.includes(DEFAULT_PROPERTY_NAMES.dateSolved)) {
    propertiesToAdd[DEFAULT_PROPERTY_NAMES.dateSolved] = { date: {} };
  }

  if (missingPropertyNames.includes(DEFAULT_PROPERTY_NAMES.leetcodeUrl)) {
    propertiesToAdd[DEFAULT_PROPERTY_NAMES.leetcodeUrl] = { url: {} };
  }

  if (Object.keys(propertiesToAdd).length === 0) {
    return;
  }

  const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties: propertiesToAdd })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const names = Object.keys(propertiesToAdd).join(', ');
    throw new Error(
      `Failed to auto-add required properties (${names}). ${errorData.message || `Notion API error: ${response.status}`}`
    );
  }

  const data = await response.json().catch(() => ({}));
  if (data.properties) {
    databaseSchemaCache.set(databaseId, {
      timestamp: Date.now(),
      properties: data.properties
    });
  }
}

async function resolveSchemaForCreate(accessToken, databaseId) {
  let schemaProperties = await getDatabaseSchemaProperties(accessToken, databaseId);
  const titlePropertyName = findTitlePropertyName(schemaProperties);

  if (!titlePropertyName) {
    throw new Error('Selected database has no title property.');
  }

  const expectedTypes = {
    [DEFAULT_PROPERTY_NAMES.difficulty]: 'select',
    [DEFAULT_PROPERTY_NAMES.dateSolved]: 'date',
    [DEFAULT_PROPERTY_NAMES.leetcodeUrl]: 'url'
  };

  const missingProperties = [];

  for (const [propertyName, expectedType] of Object.entries(expectedTypes)) {
    const property = schemaProperties[propertyName];
    if (!property) {
      missingProperties.push(propertyName);
      continue;
    }
    if (property.type !== expectedType) {
      throw new Error(
        `Selected database property "${propertyName}" must be type "${expectedType}", but found "${property.type}".`
      );
    }
  }

  if (missingProperties.length > 0) {
    await addMissingRequiredProperties(accessToken, databaseId, missingProperties);
    schemaProperties = await getDatabaseSchemaProperties(accessToken, databaseId, { forceRefresh: true });
  }

  const propertyNames = {
    ...DEFAULT_PROPERTY_NAMES,
    name: titlePropertyName
  };

  const requiredPropertyNames = [
    propertyNames.name,
    propertyNames.difficulty,
    propertyNames.dateSolved,
    propertyNames.leetcodeUrl
  ];

  return { schemaProperties, propertyNames, requiredPropertyNames };
}

// Build Notion page body content (children blocks)
function buildChildren(data) {
  const children = [];

  // Problem Description
  children.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: '\ud83d\udcdd Problem Description' } }]
    }
  });

  // Convert HTML to structured blocks for better formatting
  if (data.problem.content) {
    const descriptionBlocks = htmlToNotionBlocks(data.problem.content);
    children.push(...descriptionBlocks);
  }

  children.push({ object: 'block', type: 'divider', divider: {} });

  // My Solution
  children.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: '\ud83d\udcbb My Solution' } }]
    }
  });

  if (data.code) {
    children.push({
      object: 'block',
      type: 'code',
      code: {
        rich_text: chunkText(data.code),
        language: mapLanguage(data.language)
      }
    });
  }

  // Submission stats
  if (data.submission) {
    const parts = [];
    if (data.submission.runtimeDisplay) {
      parts.push(`Runtime: ${data.submission.runtimeDisplay}`);
      if (data.submission.runtimePercentile != null) {
        parts[parts.length - 1] += ` (beats ${data.submission.runtimePercentile.toFixed(1)}%)`;
      }
    }
    if (data.submission.memoryDisplay) {
      parts.push(`Memory: ${data.submission.memoryDisplay}`);
      if (data.submission.memoryPercentile != null) {
        parts[parts.length - 1] += ` (beats ${data.submission.memoryPercentile.toFixed(1)}%)`;
      }
    }
    if (parts.length > 0) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: parts.join(' | ') },
            annotations: { italic: true, color: 'gray' }
          }]
        }
      });
    }
  }

  children.push({ object: 'block', type: 'divider', divider: {} });

  // Complexity Analysis
  children.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: '\u23f1\ufe0f Complexity Analysis' } }]
    }
  });

  if (data.runtime) {
    children.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: `Time Complexity: ${data.runtime}` }
        }]
      }
    });
  }

  if (data.space) {
    children.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: `Space Complexity: ${data.space}` }
        }]
      }
    });
  }

  // Tips & Common Mistakes
  if (data.tips) {
    children.push({ object: 'block', type: 'divider', divider: {} });
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '\ud83d\udca1 Tips & Common Mistakes' } }]
      }
    });
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: chunkText(data.tips) }
    });
  }

  // Related Problems
  if (data.problem.similarQuestions) {
    try {
      const similar = typeof data.problem.similarQuestions === 'string'
        ? JSON.parse(data.problem.similarQuestions)
        : data.problem.similarQuestions;

      if (Array.isArray(similar) && similar.length > 0) {
        children.push({ object: 'block', type: 'divider', divider: {} });
        children.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: '\ud83d\udd17 Related Problems' } }]
          }
        });

        similar.forEach(q => {
          const url = `https://leetcode.com/problems/${q.titleSlug}/`;
          children.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [{
                type: 'text',
                text: {
                  content: `${q.title} (${q.difficulty})`,
                  link: { url }
                }
              }]
            }
          });
        });
      }
    } catch (e) {
      // Silently skip if parsing fails
    }
  }

  return children;
}

// Create a page in the Notion database
export async function createNotionPage(accessToken, databaseId, data) {
  let properties = buildProperties(data);
  let requiredPropertyNames = [
    DEFAULT_PROPERTY_NAMES.name,
    DEFAULT_PROPERTY_NAMES.difficulty,
    DEFAULT_PROPERTY_NAMES.dateSolved,
    DEFAULT_PROPERTY_NAMES.leetcodeUrl
  ];

  try {
    const schema = await resolveSchemaForCreate(accessToken, databaseId);
    requiredPropertyNames = schema.requiredPropertyNames;
    properties = buildProperties(data, schema.propertyNames);
    properties = filterPropertiesBySchema(properties, schema.schemaProperties);
  } catch (schemaError) {
    if (
      schemaError.message?.startsWith('Selected database') ||
      schemaError.message?.startsWith('Failed to auto-add required properties')
    ) {
      throw schemaError;
    }
    // If schema lookup fails, continue with built properties and rely on fallback retry.
    console.warn('Failed to fetch database schema, continuing without schema filtering:', schemaError.message);
  }

  const body = {
    parent: { database_id: databaseId },
    icon: { type: 'emoji', emoji: '\u2705' },
    properties,
    children: buildChildren(data)
  };

  const response = await fetch(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // If error is about invalid property, retry without optional properties
    const isPropertyError = (
      (errorData.code === 'validation_error' && errorData.message?.includes('body.properties')) ||
      errorData.message?.includes('is not a property that exists') ||
      errorData.message?.includes('property') && errorData.message?.includes('not') && errorData.message?.includes('exist')
    );

    if (isPropertyError) {
      console.warn('Property validation error, retrying with core properties only:', errorData.message);

      // Retry with required properties only (never include optional fields).
      const minimalProps = buildCoreProperties(body.properties, requiredPropertyNames);

      // Retry with minimal properties
      const retryBody = {
        parent: body.parent,
        icon: body.icon,
        properties: minimalProps,
        children: body.children
      };

      const retryResponse = await fetch(`${NOTION_API_BASE}/pages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(retryBody)
      });

      if (!retryResponse.ok) {
        const retryErrorData = await retryResponse.json().catch(() => ({}));
        throw new Error(retryErrorData.message || `Notion API error: ${retryResponse.status}`);
      }

      return retryResponse.json();
    }

    throw new Error(errorData.message || `Notion API error: ${response.status}`);
  }

  return response.json();
}

// Search for databases the user has shared with the integration
export async function searchDatabases(accessToken) {
  const response = await fetch(`${NOTION_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: { property: 'object', value: 'database' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Notion API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results.map(db => ({
    id: db.id,
    title: db.title?.[0]?.plain_text || 'Untitled',
    url: db.url
  }));
}

// Query database for a page with matching LeetCode URL (duplicate detection)
export async function queryDatabaseByUrl(accessToken, databaseId, leetcodeUrl) {
  const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        property: 'LeetCode URL',
        url: { equals: leetcodeUrl }
      },
      page_size: 1
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Notion API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results.length > 0 ? data.results[0] : null;
}

// Count existing solutions on a page (by counting Solution/My Solution headings)
export async function countSolutionsOnPage(accessToken, pageId) {
  const response = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children?page_size=100`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION
    }
  });

  if (!response.ok) return 1;

  const data = await response.json();
  let count = 0;
  for (const block of data.results) {
    if (block.type === 'heading_2') {
      const text = block.heading_2?.rich_text?.[0]?.plain_text || '';
      if (text.includes('Solution') || text.includes('My Solution')) {
        count++;
      }
    }
  }
  return count + 1;
}

// Append a new solution to an existing page
export async function appendSolutionToPage(accessToken, pageId, data, solutionNumber) {
  const children = [];

  children.push({ object: 'block', type: 'divider', divider: {} });

  children.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{
        type: 'text',
        text: { content: `\ud83d\udcbb Solution ${solutionNumber}` }
      }]
    }
  });

  // Language and date
  children.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{
        type: 'text',
        text: {
          content: `${data.language || 'unknown'} | ${new Date().toISOString().split('T')[0]}`
        },
        annotations: { italic: true, color: 'gray' }
      }]
    }
  });

  if (data.code) {
    children.push({
      object: 'block',
      type: 'code',
      code: {
        rich_text: chunkText(data.code),
        language: mapLanguage(data.language)
      }
    });
  }

  // Submission stats
  if (data.submission) {
    const parts = [];
    if (data.submission.runtimeDisplay) {
      let text = `Runtime: ${data.submission.runtimeDisplay}`;
      if (data.submission.runtimePercentile != null) {
        text += ` (beats ${data.submission.runtimePercentile.toFixed(1)}%)`;
      }
      parts.push(text);
    }
    if (data.submission.memoryDisplay) {
      let text = `Memory: ${data.submission.memoryDisplay}`;
      if (data.submission.memoryPercentile != null) {
        text += ` (beats ${data.submission.memoryPercentile.toFixed(1)}%)`;
      }
      parts.push(text);
    }
    if (parts.length > 0) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: parts.join(' | ') },
            annotations: { italic: true, color: 'gray' }
          }]
        }
      });
    }
  }

  // Complexity
  if (data.runtime || data.space) {
    if (data.runtime) {
      children.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: `Time: ${data.runtime}` } }]
        }
      });
    }
    if (data.space) {
      children.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: `Space: ${data.space}` } }]
        }
      });
    }
  }

  // Approach
  if (data.approach) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: `Approach: ${data.approach}` },
          annotations: { bold: true }
        }]
      }
    });
  }

  const response = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ children })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Notion API error: ${response.status}`);
  }

  return response.json();
}

// Query all pages from database (for stats/progress dashboard)
export async function queryAllPages(accessToken, databaseId) {
  const allPages = [];
  let cursor = undefined;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Notion API error: ${response.status}`);
    }

    const data = await response.json();
    allPages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return allPages;
}
