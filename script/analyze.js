document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("fileInput");
  if (input) {
    input.addEventListener("change", () => {
      if (input.files.length) uploadVideos(input.files);
    });
  }
});

async function uploadVideos(files) {
  const loader = document.getElementById("loader");
  const progressBar = document.getElementById("progressBar");
  const progressContainer = document.getElementById("progressContainer");
  const output = document.getElementById("output");

  for (let i = 0; i < files.length; i++) {
    const formData = new FormData();
    formData.append("file", files[i]);

    loader.style.display = "block";
    progressContainer.style.display = "block";

    await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://video-meta-api.onrender.com/analyze");

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = percent + "%";
        }
      };

      xhr.onload = function () {
        loader.style.display = "none";
        progressBar.style.width = "0%";
        progressContainer.style.display = "none";

        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          showResult(data);
        } else {
          alert("Upload failed for file: " + files[i].name);
        }
        resolve();
      };

      xhr.send(formData);
    });
  }
}

function showResult(data) {
  const container = document.createElement("div");
  container.className = "spoiler";

  const content = document.createElement("pre");
  const lines = [];

  lines.push(`File Name: ${data.filename}`);
  lines.push(`File Size: ${Math.round(data.size_bytes / 1024)} kB`);
  lines.push(`Analyzed At: ${data.analyzed_at}`);
  lines.push("");

  const meta = data.metadata || {};
  const format = meta.format || {};
  const tags = format.tags || {};

  for (const key in format) {
    if (typeof format[key] !== "object") {
      lines.push(`${key}: ${format[key]}`);
    }
  }

  for (const tag in tags) {
    lines.push(`${tag}: ${tags[tag]}`);
  }

  if (meta.streams?.length) {
    meta.streams.forEach((stream, i) => {
      lines.push(`--- Stream #${i} ---`);
      for (const key in stream) {
        if (typeof stream[key] !== "object") {
          lines.push(`${key}: ${stream[key]}`);
        }
      }
    });
  }

  if (data.metadata?.gps?.length) {
    lines.push("");
    data.metadata.gps.forEach(gps => {
      lines.push(`GPS Tag: ${gps.tag}`);
      lines.push(`Location: ${gps.lat}, ${gps.lon}`);
      if (gps.address) lines.push(`Address: ${gps.address}`);
    });
  }

  content.textContent = lines.join("\n");
  container.appendChild(content);
  document.getElementById("output").appendChild(container);
}
