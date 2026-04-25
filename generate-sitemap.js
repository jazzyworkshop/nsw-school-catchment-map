const fs = require("fs");
const path = require("path");

// 1. Load the object
const schoolData = require("./public/catchments.json");

// 2. Reach into the object.
// Replace 'schools' with whatever your key name is (e.g., 'data' or 'list')
const schoolsArray = schoolData.schools;

const BASE_URL = "https://localschoolmap.com";

const generateSitemap = () => {
  // Check if we actually found the array
  if (!Array.isArray(schoolsArray)) {
    console.error(
      "❌ Error: 'schoolsArray' is not an array. Check your JSON key name!",
    );
    // This logs the keys so you can see what the correct name should be
    console.log("Your JSON keys are:", Object.keys(schoolData));
    return;
  }

  const sitemapEntries = schoolsArray
    .map((school) => {
      const slug = school.name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");

      return `
  <url>
    <loc>${BASE_URL}/catchment/${slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE_URL}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
${sitemapEntries}
</urlset>`;

  fs.writeFileSync("./public/sitemap.xml", sitemap);
  console.log(
    `✅ Success! Generated sitemap with ${schoolsArray.length} links.`,
  );
};

generateSitemap();
