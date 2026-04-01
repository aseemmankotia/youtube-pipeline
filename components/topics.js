/**
 * Trending Topics Component
 * Uses DuckDuckGo instant-answer heuristic (or seed data fallback)
 * to surface the top 50 trending topics for a given niche.
 */

const NICHES = [
  'AI & Technology', 'Personal Finance', 'Health & Fitness',
  'Gaming', 'Cooking & Food', 'Travel', 'Self-Improvement',
  'Crypto & Web3', 'Science', 'Business & Entrepreneurship',
];

const TRENDS = ['Hot', 'Trending', 'Viral', 'Rising', 'New'];
const t = (i) => TRENDS[i % TRENDS.length];

// Curated seed topics per niche (50 each)
const SEED_TOPICS = {
  'AI & Technology': [
    { title: 'OpenAI GPT-5 capabilities breakdown', desc: 'Deep dive into what GPT-5 can and cannot do vs. previous models.', trend: t(0) },
    { title: 'Claude vs ChatGPT vs Gemini 2025', desc: 'Side-by-side comparison of leading AI assistants today.', trend: t(1) },
    { title: 'AI agents replacing software jobs?', desc: 'Are autonomous AI agents a threat or tool for developers?', trend: t(2) },
    { title: 'Building apps with local LLMs (Ollama)', desc: 'Run your own private AI — privacy, cost, speed.', trend: t(3) },
    { title: "Apple's AI chip M4 Ultra explained", desc: 'What makes Apple Silicon so efficient for on-device AI?', trend: t(4) },
    { title: 'Vibe coding with AI: full workflow', desc: 'How developers use AI pair-programming tools end-to-end.', trend: t(0) },
    { title: 'Anthropic vs OpenAI: who wins 2025?', desc: 'Business, safety research, and model quality compared.', trend: t(1) },
    { title: 'RAG pipelines explained simply', desc: 'Retrieval-Augmented Generation — why every AI app needs it.', trend: t(2) },
    { title: 'AI video generation is insane now', desc: 'Sora, Runway, HeyGen — what each tool does best.', trend: t(3) },
    { title: 'Google Gemini 2.0 full review', desc: 'Real-world tests across coding, writing, and multimodal tasks.', trend: t(4) },
    { title: 'Fine-tuning your own LLM in 2025', desc: 'Step-by-step guide to customising an open-source model.', trend: t(0) },
    { title: 'AI in healthcare: saves lives or hype?', desc: 'Diagnosing diseases, drug discovery, and ethical risks.', trend: t(1) },
    { title: 'Prompt engineering master guide', desc: 'Advanced techniques that actually improve AI output quality.', trend: t(2) },
    { title: 'Open-source AI vs closed models', desc: 'Llama 3, Mistral, and Phi-3 vs GPT and Claude.', trend: t(3) },
    { title: 'AI coding tools ranked: Cursor vs Copilot', desc: 'Which AI IDE extension makes you most productive?', trend: t(4) },
    { title: 'Is Artificial General Intelligence near?', desc: 'What experts actually say about AGI timelines.', trend: t(0) },
    { title: 'Building a no-code AI app in one hour', desc: 'Tools like Bubble, Glide, and Zapier now have native AI.', trend: t(1) },
    { title: 'AI music generation explodes in 2025', desc: 'Suno, Udio, Arca — making full songs with AI.', trend: t(2) },
    { title: 'How neural networks actually work', desc: 'Visual explainer for non-technical audiences.', trend: t(3) },
    { title: 'AI girlfriends and social isolation risk', desc: 'Exploring the ethics and psychology of AI companionship.', trend: t(4) },
    { title: 'Data privacy with AI tools', desc: 'What happens to your data when you use ChatGPT.', trend: t(0) },
    { title: 'AI image generators: MidJourney vs DALL-E 3', desc: 'Quality, speed, and use-case comparison.', trend: t(1) },
    { title: 'Robotics + AI: the humanoid robot race', desc: "Figure, Tesla Optimus, Boston Dynamics — where we're headed.", trend: t(2) },
    { title: 'AI for content creators — full toolkit', desc: 'Script, design, voiceover, and editing with AI.', trend: t(3) },
    { title: 'Vector databases explained', desc: 'Pinecone, Weaviate, Chroma — why they power modern AI apps.', trend: t(4) },
    { title: 'AI regulation in the EU vs US', desc: 'How the AI Act and US executive orders differ.', trend: t(0) },
    { title: 'Self-driving cars: 2025 status report', desc: 'Waymo, Tesla FSD, and the state of autonomous driving.', trend: t(1) },
    { title: 'LangChain vs LlamaIndex for AI apps', desc: 'Choosing the right orchestration framework.', trend: t(2) },
    { title: 'AI search engines vs Google', desc: 'Perplexity, You.com, and SearchGPT — can they dethrone Google?', trend: t(3) },
    { title: 'Deepfakes in 2025: detection and danger', desc: 'How realistic they are and what is being done about it.', trend: t(4) },
    { title: 'AI in education: personalised learning', desc: 'Khan Academy, Khanmigo, and AI tutors for every student.', trend: t(0) },
    { title: 'How to use AI to automate your workflow', desc: 'Make.com, n8n, and Zapier AI workflows.', trend: t(1) },
    { title: 'Quantisation explained: run big AI on small hardware', desc: 'GGUF, GPTQ, AWQ — running big models locally.', trend: t(2) },
    { title: 'AI-generated YouTube channels making money', desc: 'Faceless channels entirely run by AI tools.', trend: t(3) },
    { title: 'Claude 3.7 Sonnet review', desc: 'Real coding and reasoning tests vs GPT-4o.', trend: t(4) },
    { title: 'AI drug discovery breakthroughs', desc: 'How AlphaFold and AI are revolutionising medicine.', trend: t(0) },
    { title: 'The best free AI tools in 2025', desc: 'A curated list of powerful AI tools that cost nothing.', trend: t(1) },
    { title: 'Building a chatbot with RAG in Python', desc: 'End-to-end tutorial using LangChain and OpenAI.', trend: t(2) },
    { title: 'AI superpowers for small businesses', desc: 'Marketing, support, and operations on a budget.', trend: t(3) },
    { title: 'Mixture of Experts models explained', desc: 'Why Mixtral and GPT-4o use this architecture.', trend: t(4) },
    { title: 'AI in law: contract review and legal research', desc: 'How lawyers are using AI without losing jobs.', trend: t(0) },
    { title: 'Text-to-3D: the next frontier in AI creation', desc: 'Generating 3D models from a sentence.', trend: t(1) },
    { title: 'AI phone calls that sound human', desc: 'Bland.ai, Synthflow — what AI voice agents can do now.', trend: t(2) },
    { title: 'Machine learning without coding', desc: 'AutoML tools that let anyone train models.', trend: t(3) },
    { title: 'AI in cybersecurity: threat and defence', desc: 'How attackers and defenders both use AI.', trend: t(4) },
    { title: 'Running AI on your phone in 2025', desc: 'On-device models — Apple, Google, and Qualcomm approaches.', trend: t(0) },
    { title: 'AI voice cloning — is yours safe?', desc: 'How voice cloning works and how to protect yourself.', trend: t(1) },
    { title: 'Agentic AI: what it means and why it matters', desc: 'Agents that plan, browse, and act autonomously.', trend: t(2) },
    { title: 'AI for investing: can it beat the market?', desc: 'Robo-advisors, AI hedge funds, and retail tools tested.', trend: t(3) },
    { title: 'Future of work: what AI cannot replace', desc: 'Jobs and skills that will stay human.', trend: t(4) },
  ],

  'Personal Finance': [
    { title: 'High-yield savings vs. T-bills in 2025', desc: 'Where to park your emergency fund for max return.', trend: t(0) },
    { title: 'Index fund investing for beginners', desc: 'Everything a newbie needs to start with index funds.', trend: t(1) },
    { title: 'How to negotiate a higher salary', desc: 'Scripts and tactics that actually work.', trend: t(2) },
    { title: 'FIRE movement: retire by 40', desc: 'Realistic breakdown of Financial Independence / Early Retirement.', trend: t(3) },
    { title: 'Credit card rewards maximisation', desc: 'Turn everyday spend into free flights and cashback.', trend: t(4) },
    { title: 'How to pay off $50k in debt fast', desc: 'Snowball vs avalanche — which actually works best.', trend: t(0) },
    { title: 'Roth IRA vs 401k — which wins?', desc: 'Tax strategy for every income level explained.', trend: t(1) },
    { title: 'Building an emergency fund from zero', desc: 'Step-by-step guide even on a tight budget.', trend: t(2) },
    { title: 'How to invest your first $1,000', desc: 'Best options for complete beginners in 2025.', trend: t(3) },
    { title: 'Side hustles making $1k+/month', desc: 'Real people, real results — no fluff.', trend: t(4) },
    { title: 'The 50/30/20 budget rule explained', desc: 'Simple framework to control your money forever.', trend: t(0) },
    { title: 'Real estate investing without a lot of money', desc: 'REITs, house hacking, and low-down-payment strategies.', trend: t(1) },
    { title: 'Dividend investing for passive income', desc: 'How to build a portfolio that pays you every month.', trend: t(2) },
    { title: 'Why most people never build wealth', desc: 'The psychological traps keeping you broke.', trend: t(3) },
    { title: 'How to improve your credit score fast', desc: 'Actionable steps that move the needle in weeks.', trend: t(4) },
    { title: 'Frugal living without feeling deprived', desc: 'Spending less while living well.', trend: t(0) },
    { title: 'Tax strategies for W-2 employees', desc: 'Legal deductions most people miss.', trend: t(1) },
    { title: 'How compound interest really works', desc: 'Visual breakdown of why starting early matters so much.', trend: t(2) },
    { title: 'Digital nomad finances explained', desc: 'Banking, taxes, and investing while working remotely abroad.', trend: t(3) },
    { title: 'Investing in 2025 amid inflation', desc: 'Assets that protect and grow in high-inflation environments.', trend: t(4) },
    { title: 'Should you buy or rent a home in 2025?', desc: 'Honest analysis based on real numbers.', trend: t(0) },
    { title: 'Passive income ideas that actually work', desc: 'Separating the real opportunities from the scams.', trend: t(1) },
    { title: "Millionaire's money habits you can copy", desc: 'Behaviours common among self-made millionaires.', trend: t(2) },
    { title: 'ETFs vs mutual funds: which is better?', desc: 'Cost, flexibility, and tax efficiency compared.', trend: t(3) },
    { title: 'How to negotiate your bills down', desc: 'Scripts for internet, insurance, rent, and more.', trend: t(4) },
    { title: 'Stock market basics in 10 minutes', desc: 'Everything a beginner must know to get started.', trend: t(0) },
    { title: 'Saving for college: 529 plans explained', desc: "How to fund your child's education tax-efficiently.", trend: t(1) },
    { title: 'Protecting your money from inflation', desc: 'TIPS, I-bonds, commodities, and real assets.', trend: t(2) },
    { title: 'How to start freelancing as a side income', desc: 'Platforms, pricing, and getting your first client.', trend: t(3) },
    { title: 'Life insurance: how much do you really need?', desc: 'Term vs whole life, and calculating the right amount.', trend: t(4) },
    { title: 'Crypto as part of your portfolio', desc: 'How much allocation makes sense and in which coins.', trend: t(0) },
    { title: 'Zero-based budgeting explained', desc: 'Every dollar assigned — a powerful money control method.', trend: t(1) },
    { title: 'How to make money with a blog in 2025', desc: 'SEO, monetisation, and realistic timelines.', trend: t(2) },
    { title: 'Buying your first car financially smart', desc: 'New vs used, loan vs lease, and negotiation tips.', trend: t(3) },
    { title: 'Dollar-cost averaging: does it actually work?', desc: 'Strategy and evidence for DCA vs lump-sum investing.', trend: t(4) },
    { title: 'How to save $10k in 12 months', desc: 'Practical plan anyone on a normal income can follow.', trend: t(0) },
    { title: 'Estate planning basics you need now', desc: 'Wills, trusts, and beneficiaries — not just for the rich.', trend: t(1) },
    { title: 'Turning a hobby into a business', desc: 'Tax structure, pricing, and scaling a passion project.', trend: t(2) },
    { title: 'Financial mistakes to avoid in your 20s', desc: 'Lessons that cost others years of progress.', trend: t(3) },
    { title: 'How wealthy people think about money differently', desc: 'Mindset shifts that separate the rich from the rest.', trend: t(4) },
    { title: 'Social Security: when to claim for maximum benefit', desc: 'The math behind claiming at 62 vs 67 vs 70.', trend: t(0) },
    { title: 'Best investment apps for beginners', desc: 'Robinhood, Fidelity, M1 Finance — ranked and reviewed.', trend: t(1) },
    { title: 'How to budget when your income is irregular', desc: 'Freelancers and gig workers — a different approach.', trend: t(2) },
    { title: 'The power of a health savings account (HSA)', desc: 'The triple tax advantage most people overlook.', trend: t(3) },
    { title: 'Building credit from scratch', desc: 'Secured cards, credit-builder loans, and authorised user tricks.', trend: t(4) },
    { title: 'Investing in gold vs stocks', desc: 'Historical returns, risk profiles, and portfolio role.', trend: t(0) },
    { title: 'How to retire comfortably on an average salary', desc: 'The realistic maths behind a middle-income retirement.', trend: t(1) },
    { title: 'Grocery savings hacks that save $200+/month', desc: 'Meal planning, store brands, and cashback apps.', trend: t(2) },
    { title: 'What to do with a $10k windfall', desc: 'Prioritising debt, emergency fund, and investing.', trend: t(3) },
    { title: 'Protecting yourself from financial fraud', desc: 'Common scams targeting everyday people in 2025.', trend: t(4) },
  ],

  'Gaming': [
    { title: 'GTA VI release date & what we know', desc: 'Everything confirmed about the most anticipated game ever.', trend: t(0) },
    { title: 'Best budget gaming PC builds 2025', desc: 'Top-tier performance under $800.', trend: t(1) },
    { title: 'Palworld surpasses 50M players', desc: 'Why this indie hit keeps growing.', trend: t(2) },
    { title: 'Xbox vs PlayStation in 2025', desc: 'Which console ecosystem wins this generation?', trend: t(3) },
    { title: 'Speedrunning world records broken', desc: 'Latest incredible speedrun feats explained.', trend: t(4) },
    { title: 'Best RPGs of 2025 ranked', desc: 'Must-play role-playing games released this year.', trend: t(0) },
    { title: 'How to go pro in esports', desc: 'Realistic roadmap for competitive gaming in 2025.', trend: t(1) },
    { title: 'Elden Ring DLC: every secret found', desc: 'Exhaustive breakdown of Shadow of the Erdtree content.', trend: t(2) },
    { title: 'The best gaming monitors under $300', desc: 'High refresh, low latency picks for every GPU tier.', trend: t(3) },
    { title: 'AI NPCs: gaming will never be the same', desc: 'How procedural AI dialogue is transforming game worlds.', trend: t(4) },
    { title: 'Helldivers 2 — why it dominated 2024', desc: 'Community, gameplay, and developer communication done right.', trend: t(0) },
    { title: 'Best gaming headsets of 2025', desc: 'Sound quality and microphone tests at every price.', trend: t(1) },
    { title: 'Game pass value breakdown 2025', desc: 'Is Xbox Game Pass actually worth the money?', trend: t(2) },
    { title: 'How streamers make money on Twitch', desc: 'Subs, bits, sponsorships, and merch — the full picture.', trend: t(3) },
    { title: 'Nintendo Switch 2 everything we know', desc: 'Specs, launch titles, and release date rumours.', trend: t(4) },
    { title: 'Retro gaming revival: why nostalgia sells', desc: 'Why old-school games are more popular than ever.', trend: t(0) },
    { title: 'Best free-to-play games 2025', desc: 'No-cost games that are genuinely worth your time.', trend: t(1) },
    { title: 'Gaming addiction: signs and solutions', desc: 'When gaming becomes a problem and how to address it.', trend: t(2) },
    { title: 'How loot boxes are regulated worldwide', desc: 'Legal status in EU, US, and Asia in 2025.', trend: t(3) },
    { title: 'PC vs console: honest comparison 2025', desc: 'Cost, convenience, and game library compared fairly.', trend: t(4) },
    { title: 'Best indie games of 2025', desc: 'Small studios, massive experiences.', trend: t(0) },
    { title: 'Gaming chairs vs office chairs for long sessions', desc: 'What actually matters for comfort and posture.', trend: t(1) },
    { title: 'How to grow a gaming YouTube channel', desc: 'Niche selection, SEO, and content formats that work.', trend: t(2) },
    { title: 'The history of the FPS genre', desc: 'From Wolfenstein 3D to Valorant.', trend: t(3) },
    { title: 'Is 4K gaming worth it in 2025?', desc: 'Resolution, frame rate, and GPU requirements honestly assessed.', trend: t(4) },
    { title: 'Final Fantasy VII Rebirth full review', desc: 'Story, gameplay, and how it compares to the original.', trend: t(0) },
    { title: 'Gaming scholarships — yes, they exist', desc: 'How students are getting paid to play in college.', trend: t(1) },
    { title: 'VR gaming in 2025: is it finally mainstream?', desc: 'Quest 3, PSVR2, and the state of virtual reality.', trend: t(2) },
    { title: 'How speedrunners exploit game glitches', desc: 'The science and community behind any% world records.', trend: t(3) },
    { title: 'Best co-op games to play with friends', desc: 'Online and couch co-op picks for every genre.', trend: t(4) },
    { title: 'Mobile gaming vs console: bridging the gap', desc: 'How mobile games now rival console experiences.', trend: t(0) },
    { title: 'Game development with Unreal Engine 5', desc: 'Beginner guide to the engine powering next-gen games.', trend: t(1) },
    { title: 'The greatest gaming controversies ever', desc: 'Loot boxes, crunch, review bombing, and more.', trend: t(2) },
    { title: 'How games are made: full production pipeline', desc: 'From concept to launch — inside a AAA studio.', trend: t(3) },
    { title: 'Best gaming keyboards for competitive play', desc: 'Switch types, response times, and top picks tested.', trend: t(4) },
    { title: 'Minecraft in 2025: still the king?', desc: 'Player counts, updates, and why it refuses to die.', trend: t(0) },
    { title: 'How to reduce input lag for competitive gaming', desc: 'Monitor, settings, and hardware tips.', trend: t(1) },
    { title: 'Gaming and mental health: the research', desc: 'What science actually says about games and well-being.', trend: t(2) },
    { title: 'The best gaming mice of 2025', desc: 'Sensor accuracy, weight, and grip-style recommendations.', trend: t(3) },
    { title: 'Why Balatro became a viral hit', desc: 'Dissecting the design of 2024\'s breakout card game.', trend: t(4) },
    { title: 'How game publishers manipulate pre-orders', desc: 'Tactics used and how to protect yourself.', trend: t(0) },
    { title: 'Best strategy games of 2025', desc: '4X, RTS, and tactics games that demand your brain.', trend: t(1) },
    { title: 'Cloud gaming: is it ready to replace consoles?', desc: 'Xbox Cloud, GeForce NOW, and PS Now tested.', trend: t(2) },
    { title: 'How to build a gaming PC for the first time', desc: 'Part selection, assembly, and software setup guide.', trend: t(3) },
    { title: 'Game preservation: why old games disappear', desc: 'Emulation, DRM, and the fight to save gaming history.', trend: t(4) },
    { title: 'The best story-driven games ever made', desc: 'Narrative masterpieces across every generation.', trend: t(0) },
    { title: 'Competitive Fortnite: is it still relevant?', desc: 'Player counts, prize pools, and the meta in 2025.', trend: t(1) },
    { title: 'How gaming influencers make millions', desc: 'Revenue streams of the top gaming creators.', trend: t(2) },
    { title: 'Gaming without a high-end PC — options explained', desc: 'Cloud, integrated graphics, and smart compromises.', trend: t(3) },
    { title: 'The psychology of why games are addictive', desc: 'Variable reward, flow states, and game designers\' tricks.', trend: t(4) },
  ],
};

// Expanded generic topics for niches not in SEED_TOPICS (50 per niche)
function genericTopics(niche) {
  const templates = [
    [`Top trends in ${niche} right now`, `What's dominating ${niche} content this month.`],
    [`Beginner's guide to ${niche}`, `Everything a newcomer needs to know to get started.`],
    [`${niche} mistakes everyone makes`, 'Common pitfalls and how to avoid them.'],
    [`How to grow a ${niche} YouTube channel`, 'Tactics that actually work in this niche.'],
    [`Future of ${niche} — 2025 and beyond`, 'Predictions and emerging directions.'],
    [`How to make money in ${niche}`, 'Monetisation strategies that real creators use.'],
    [`Best ${niche} tools and resources`, 'The top tools every ${niche} enthusiast should know.'],
    [`${niche} for complete beginners`, 'Start here if you know absolutely nothing.'],
    [`Advanced ${niche} techniques`, 'Level up your skills beyond the basics.'],
    [`${niche} myths debunked`, 'Popular misconceptions exposed with evidence.'],
    [`Day in the life of a ${niche} professional`, 'What it actually looks like to work in this field.'],
    [`How ${niche} is changing in 2025`, 'Key shifts and why they matter.'],
    [`The best ${niche} content creators`, 'Who to follow and why.'],
    [`${niche} on a budget`, 'Getting started without spending much money.'],
    [`${niche} challenges and how to overcome them`, 'Real obstacles people face and practical solutions.'],
    [`Is ${niche} right for you?`, 'Honest pros and cons before you commit.'],
    [`${niche} community: where to connect`, 'Forums, Discord servers, and events worth joining.'],
    [`History of ${niche}`, 'How it evolved to where it is today.'],
    [`${niche} industry insider secrets`, 'What professionals know that beginners do not.'],
    [`How to learn ${niche} faster`, 'Techniques to compress years of learning into months.'],
    [`${niche} success stories`, 'People who went from zero to expert.'],
    [`What no one tells you about ${niche}`, 'Uncomfortable truths that will save you time.'],
    [`${niche} equipment and gear guide`, 'What to buy first and what to skip.'],
    [`${niche} statistics you should know`, 'Data that shows where the industry is headed.'],
    [`How AI is changing ${niche}`, 'Automation, tools, and what it means for practitioners.'],
    [`${niche} for passive income`, 'Ways to earn money from your ${niche} knowledge.'],
    [`${niche} vs similar alternatives`, 'How it compares to adjacent fields or hobbies.'],
    [`Top ${niche} books to read`, 'Essential reading recommended by experts.'],
    [`${niche} podcasts worth your time`, 'Audio content for learning on the go.'],
    [`${niche} courses: free vs paid`, 'Where to get the best education without overspending.'],
    [`Breaking into ${niche} professionally`, 'How to transition into a career in this field.'],
    [`${niche} side hustle ideas`, 'Turn your interest into extra monthly income.'],
    [`How to stay motivated in ${niche}`, 'Dealing with burnout and plateaus.'],
    [`${niche} trends to watch in 2026`, 'What is coming next and how to prepare.'],
    [`The biggest ${niche} events of the year`, 'Conferences, competitions, and milestones.'],
    [`${niche} for kids and teens`, 'Age-appropriate ways to get the next generation involved.'],
    [`${niche} productivity hacks`, 'Get more done in less time in this field.'],
    [`How to find a ${niche} mentor`, 'Strategies to connect with experienced guides.'],
    [`${niche} burnout: signs and recovery`, 'Recognise the symptoms and reset effectively.'],
    [`The science behind ${niche}`, 'Research-backed insights for curious minds.'],
    [`${niche} and mental health`, 'The psychological impact — positive and negative.'],
    [`${niche} collaborations that changed everything`, 'Partnerships and crossovers with huge impact.'],
    [`${niche} controversies explained`, 'Divisive topics in the community and what to think.'],
    [`How to document your ${niche} journey`, 'Content formats and platforms for sharing progress.'],
    [`${niche} Q&A: your questions answered`, 'Common questions from beginners answered honestly.'],
    [`${niche} influencer marketing breakdown`, 'How brands use creators in this space.'],
    [`What makes a great ${niche} YouTube video?`, 'Format, pacing, and topic choices that drive views.'],
    [`${niche} glossary: terms you need to know`, 'A plain-English reference for new learners.'],
    [`${niche} rules and regulations in 2025`, 'Legal and policy changes affecting this space.'],
    [`${niche} world records and achievements`, 'The most impressive feats ever accomplished.'],
  ];
  return templates.map(([title, desc], i) => ({ title, desc, trend: t(i) }));
}

export function renderTopics(container, onTopicSelect) {
  container.innerHTML = `
    <div class="card">
      <h2>Discover Trending Topics</h2>
      <div class="form-row">
        <div class="form-group">
          <label for="niche-select">Your Niche</label>
          <select id="niche-select">
            ${NICHES.map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="custom-niche">Or enter a custom niche</label>
          <input type="text" id="custom-niche" placeholder="e.g. Woodworking, Mindfulness…" />
        </div>
      </div>
      <button class="btn btn-primary" id="fetch-topics-btn">
        <span>Search Trends</span>
      </button>
      <div id="topics-status"></div>
    </div>
    <div id="topics-results"></div>
  `;

  container.querySelector('#fetch-topics-btn')
    .addEventListener('click', () => fetchTopics(container, onTopicSelect));
}

async function fetchTopics(container, onTopicSelect) {
  const nicheSelect = container.querySelector('#niche-select').value;
  const customNiche = container.querySelector('#custom-niche').value.trim();
  const niche = customNiche || nicheSelect;

  const statusEl  = container.querySelector('#topics-status');
  const resultsEl = container.querySelector('#topics-results');
  const btn       = container.querySelector('#fetch-topics-btn');

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Searching…</span>';
  statusEl.innerHTML  = '';
  resultsEl.innerHTML = '';

  try {
    let topics = null;

    try {
      topics = await liveSearch(niche);
    } catch (_) {
      // Live search unavailable — fall through to seed data
    }

    if (!topics || topics.length === 0) {
      topics = SEED_TOPICS[niche] || genericTopics(niche);
      statusEl.innerHTML = `
        <div class="status-bar info">
          Showing curated trending topics for <strong>${niche}</strong>.
          Connect a search API for live results.
        </div>`;
    } else {
      statusEl.innerHTML = `
        <div class="status-bar success">
          Live trends fetched for <strong>${niche}</strong>.
        </div>`;
    }

    renderTopicCards(resultsEl, topics, niche, onTopicSelect);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Search Trends</span>';
  }
}

async function liveSearch(niche) {
  const query = encodeURIComponent(`${niche} youtube trending 2025`);
  const url   = `https://api.duckduckgo.com/?q=${query}&format=json&no_redirect=1&skip_disambig=1`;
  const res   = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('Search unavailable');
  const data = await res.json();

  const related = (data.RelatedTopics || [])
    .filter(t => t.Text && t.FirstURL)
    .slice(0, 50)
    .map((t, i) => ({
      title: t.Text.split(' - ')[0] || t.Text.slice(0, 60),
      desc:  t.Text.split(' - ')[1] || t.Text.slice(0, 120),
      trend: TRENDS[i % TRENDS.length],
    }));

  return related.length >= 3 ? related : null;
}

function renderTopicCards(container, topics, niche, onTopicSelect) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <h2 style="margin:0;">
          Top 50 Trending — ${escHtml(niche)}
          <span style="color:var(--muted);font-weight:400;font-size:0.85rem;margin-left:8px;">
            ${topics.length} topic${topics.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <input type="text" id="topics-filter"
          placeholder="Filter topics…"
          style="width:220px;padding:7px 12px;background:var(--surface2);border:1px solid var(--border);
                 border-radius:6px;color:var(--text);font-size:0.88rem;" />
      </div>
      <div class="topics-grid topics-scroll" id="topics-list">
        ${topics.map((t, i) => topicCardHtml(t, i)).join('')}
      </div>
      <p id="topics-empty" style="display:none;text-align:center;color:var(--muted);padding:24px 0;">
        No topics match your filter.
      </p>
    </div>
  `;

  // Click to select
  container.querySelectorAll('.topic-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.topic-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      onTopicSelect(topics[parseInt(el.dataset.index)], niche);
    });
  });

  // Filter box
  container.querySelector('#topics-filter').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    let visible = 0;
    container.querySelectorAll('.topic-item').forEach(el => {
      const text = el.textContent.toLowerCase();
      const show = !q || text.includes(q);
      el.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    container.querySelector('#topics-empty').style.display = visible === 0 ? 'block' : 'none';
  });
}

function topicCardHtml(t, i) {
  return `
    <div class="topic-item" data-index="${i}">
      <span class="topic-number">${i + 1}</span>
      <div class="topic-content">
        <div class="topic-title">${escHtml(t.title)}</div>
        <div class="topic-desc">${escHtml(t.desc)}</div>
      </div>
      <span class="topic-badge">${escHtml(t.trend)}</span>
    </div>
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
