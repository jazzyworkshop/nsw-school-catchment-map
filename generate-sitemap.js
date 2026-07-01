const fs = require("fs");
const path = require("path");

// 1. Load the object
const schoolData = require("./public/catchments.json");

// 2. Reach into the object
const schoolsArray = schoolData.schools;

const BASE_URL = "https://localschoolmap.com";

const generateSitemap = () => {
  // Check if we actually found the array
  if (!Array.isArray(schoolsArray)) {
    console.error(
      "❌ Error: 'schoolsArray' is not an array. Check your JSON key name!",
    );
    console.log("Your JSON keys are:", Object.keys(schoolData));
    return;
  }

  // Generate entries for all dynamic catchment pages
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

  // Build the complete sitemap XML string (Injecting the new pages right under the homepage link)
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE_URL}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${BASE_URL}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
  <url><loc>${BASE_URL}/privacy</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
${sitemapEntries}
</urlset>`;

  fs.writeFileSync("./public/sitemap.xml", sitemap);
  
  // Adjusted log count to account for the home page + 2 new additions
  console.log(
    `✅ Success! Generated sitemap with ${schoolsArray.length + 3} total structural links.`,
  );
};

generateSitemap();