const menuItems = document.querySelectorAll<HTMLLIElement>(".menu-item");
const content = document.getElementById("content");

menuItems.forEach(item => {
  item.addEventListener("click", () => {
    menuItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");

    if (item.dataset.tab === "orders") {
      content!.innerHTML = `<p class="placeholder">Server HTML fragment for Order Requests will appear here.</p>`;
    }
  });
});

// incomplete junk