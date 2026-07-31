const form = document.querySelector("#ask-form");
const input = document.querySelector("#question");
const result = document.querySelector("#result");

document.querySelectorAll("[data-question]").forEach(button => button.addEventListener("click", () => {
  input.value = button.dataset.question;
  form.requestSubmit();
}));

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = form.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Checking sources…";
  try {
    const response = await fetch("/api/ask", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({question:input.value})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    document.querySelector("#error").hidden = true;
    document.querySelector("#answer").textContent = data.answer;
    document.querySelector("#confidence").textContent = `${Math.round(data.confidence * 100)}%`;
    document.querySelector("#sources").replaceChildren(...data.citations.map(source => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url; link.textContent = source.title; link.target = "_blank"; link.rel = "noreferrer";
      item.append(link);
      const excerpts = data.evidence?.filter(item => data.citations[item.citation - 1]?.id === source.id) ?? [];
      for (const evidence of excerpts) {
        const quote = document.createElement('blockquote');
        quote.textContent = evidence.text;
        item.append(quote);
      }
      return item;
    }));
    document.querySelector("#actions").replaceChildren(...data.actions.map(action => {
      const item = document.createElement("li"); item.textContent = action.text; return item;
    }));
    document.querySelector("#actions-wrap").hidden = !data.actions.length;
    result.hidden = false;
  } catch (error) {
    const message = document.querySelector('#error');
    message.textContent = error.message || 'Could not reach the service. Please retry.';
    message.hidden = false;
    result.hidden = true;
  } finally {
    submit.disabled = false;
    submit.textContent = "Ask BridgeAI";
  }
});


async function loadDeadlines() {
  const list = document.querySelector('#deadlines');
  try {
    const response = await fetch('/api/deadlines');
    if (!response.ok) throw new Error('Could not load deadlines');
    const {events} = await response.json();
    list.replaceChildren(...events.map(event => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = event.url;
      link.textContent = `${event.date}: ${event.action}`;
      link.rel = 'noreferrer';
      item.append(link);
      return item;
    }));
    if (!events.length) list.textContent = 'No upcoming dates are currently indexed.';
  } catch { list.textContent = 'Deadlines are unavailable. Try again later.'; }
}
loadDeadlines();

const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-query');
const searchResults = document.querySelector('#search-results');
const searchStatus = document.querySelector('#search-status');
const moreButton = document.querySelector('#search-more');
let searchCursor = null;
let searchQuery = '';
let searchRequest = 0;
let searchAbort = null;

async function searchNotices(append = false) {
  const requestId = ++searchRequest;
  searchAbort?.abort();
  searchAbort = new AbortController();
  if (!append) {
    searchQuery = searchInput.value.trim();
    searchCursor = null;
    searchResults.replaceChildren();
  }
  const parameters = new URLSearchParams({q:searchQuery, limit:'5'});
  if (append && searchCursor) parameters.set('cursor', searchCursor);
  const submit = searchForm.querySelector('button');
  submit.disabled = true; moreButton.disabled = true;
  searchStatus.textContent = 'Searching notices…';
  try {
    const response = await fetch('/api/search?' + parameters, {signal:searchAbort.signal});
    const data = await response.json();
    if (requestId !== searchRequest) return;
    if (!response.ok) throw new Error(data.error ?? 'Search failed');
    for (const item of data.items) {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = item.url; link.textContent = item.title; link.target = '_blank'; link.rel = 'noreferrer';
      const excerpt = document.createElement('blockquote'); excerpt.textContent = item.excerpt;
      const details = document.createElement('details');
      const label = document.createElement('summary'); label.textContent = 'Why this matched';
      const explanation = document.createElement('p');
      explanation.textContent = `Matched terms: ${item.explanation.matchedTerms.join(', ')}. Published ${item.publishedAt.slice(0, 10)}. Results rank by text relevance, freshness, and source authority.`;
      details.append(label, explanation); row.append(link, excerpt, details); searchResults.append(row);
    }
    searchCursor = data.nextCursor;
    moreButton.hidden = !searchCursor;
    searchStatus.textContent = data.total ? `${searchResults.children.length} of ${data.total}${data.capped ? '+' : ''} matching excerpts` : 'No matching excerpts. Try a different topic.';
  } catch (failure) {
    if (requestId !== searchRequest || failure.name === 'AbortError') return;
    searchStatus.textContent = failure.message || 'Search is unavailable. Try again.';
    if (!append) moreButton.hidden = true;
  } finally {
    if (requestId === searchRequest) { submit.disabled = false; moreButton.disabled = false; }
  }
}
searchForm.addEventListener('submit', event => { event.preventDefault(); searchNotices(); });
moreButton.addEventListener('click', () => searchNotices(true));
