'use strict';

module.exports = {
  createTopicsResponse(topics) {
    return {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(topics) }],
      usage: { input_tokens: 500, output_tokens: 800 },
    };
  },

  createScriptResponse(script, truncated = false) {
    return {
      stop_reason: truncated ? 'max_tokens' : 'end_turn',
      content: [{ type: 'text', text: script }],
      usage: { input_tokens: 800, output_tokens: 3000 },
    };
  },

  createWebSearchResponse(topics) {
    return {
      stop_reason: 'end_turn',
      content: [
        { type: 'tool_use',    name: 'web_search', input: { query: 'test query' } },
        { type: 'tool_result', content: [{ type: 'text', text: 'search results' }] },
        { type: 'text',        text: JSON.stringify(topics) },
      ],
      usage: { input_tokens: 1200, output_tokens: 900 },
    };
  },
};
