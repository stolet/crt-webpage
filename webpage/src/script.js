document.addEventListener("DOMContentLoaded", () => {
  const elements = document.querySelectorAll("p, h2, h1, li, span.subtext, div.subtext");

  elements.forEach((element) => {
      const originalHTML = element.innerHTML;

      const scrambledHTML = scrambleHTML(originalHTML);
      element.innerHTML = scrambledHTML;

      unscrambleHTML(element, originalHTML, 10000);
  });

  function scrambleHTML(html) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      scrambleTextNodes(tempDiv);
      return tempDiv.innerHTML;
  }

  function scrambleTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = scrambleText(node.nodeValue);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
          Array.from(node.childNodes).forEach(scrambleTextNodes);
      }
  }

  function unscrambleHTML(element, originalHTML, duration) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = originalHTML;

      const interval = 50; // Update every 50ms
      const totalSteps = duration / interval;
      let step = 0;

      const intervalId = setInterval(() => {
          step++;
          const progress = step / totalSteps;

          // Gradually unscramble each text node
          unscrambleTextNodes(element, tempDiv, progress);

          if (step >= totalSteps) {
              clearInterval(intervalId);
              element.innerHTML = originalHTML; // Ensure final HTML is exact
          }
      }, interval);
  }

  function unscrambleTextNodes(currentNode, originalNode, progress) {
      if (currentNode.nodeType === Node.TEXT_NODE && originalNode.nodeType === Node.TEXT_NODE) {
          currentNode.nodeValue = unscrambleText(currentNode.nodeValue, originalNode.nodeValue, progress);
      } else if (currentNode.nodeType === Node.ELEMENT_NODE && originalNode.nodeType === Node.ELEMENT_NODE) {
          Array.from(currentNode.childNodes).forEach((childNode, index) => {
              unscrambleTextNodes(childNode, originalNode.childNodes[index], progress);
          });
      }
  }

  function scrambleText(text) {
      const characters = "!@#$%^&*()_+1234567890-=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
      return text.split("").map(char => char === " " ? " " : characters[Math.floor(Math.random() * characters.length)]).join("");
  }

  function unscrambleText(scrambled, original, progress) {
      return original.split("").map((char, index) => {
          if (Math.random() < progress) {
              return original[index];
          } else {
              return scrambled[index] || scrambleText(char);
          }
      }).join("");
  }
});
