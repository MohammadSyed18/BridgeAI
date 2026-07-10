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
    document.querySelector("#answer").textContent = data.answer;
    document.querySelector("#confidence").textContent = `${Math.round(data.confidence * 100)}%`;
    document.querySelector("#sources").replaceChildren(...data.citations.map(source => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url; link.textContent = source.title; link.target = "_blank"; link.rel = "noreferrer";
      item.append(link); return item;
    }));
    document.querySelector("#actions").replaceChildren(...data.actions.map(action => {
      const item = document.createElement("li"); item.textContent = action.text; return item;
    }));
    document.querySelector("#actions-wrap").hidden = !data.actions.length;
    result.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Ask BridgeAI";
  }
});

