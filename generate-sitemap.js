const fs = require("fs");
const path = require("path");

// 1. Point to your actual school database instead of the map file
const SCHOOLS_MASTER_PATH = path.join(__dirname, "public", "schools_master.json");
const SITEMAP_OUTPUT_PATH = path.join(__dirname, "public", "sitemap.xml");

const BASE_URL = "https://localschoolmap.com";

const generateSitemap = () => {
  // Check if schools master file exists
  if (!fs.existsSync(SCHOOLS_MASTER_PATH)) {
    console.error(`❌ Error: Cannot find schools master file at: ${SCHOOLS_MASTER_PATH}`);
    return;
  }

  const schoolData = require(SCHOOLS_MASTER_PATH);
  const recordsArray = schoolData.records;

  if (!Array.isArray(recordsArray)) {
    console.error("❌ Error: 'records' is not an array. Check your schools_master.json structure!");
    return;
  }

  // Generate entries for all dynamic catchment pages
  const sitemapEntries = recordsArray
    .map((row) => {
      const schoolName = row[2] || "Unknown";
      
      // 💡 MATCHES YOUR MAPVIEW HANDELESCHOOLCLICK SLUG REGEX EXACTLY
      const slug = schoolName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");

      // Skip invalid/unnamed rows if they happen to exist
      if (schoolName === "Unknown" || !slug) return "";

      return `
  <url>
    <loc>${BASE_URL}/catchment/${slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("");

  // Build the complete sitemap XML string
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE_URL}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${BASE_URL}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
  <url><loc>${BASE_URL}/privacy</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
${sitemapEntries}
</urlset>`;

  fs.writeFileSync(SITEMAP_OUTPUT_PATH, sitemap);
  console.log(
    `✅ Success! Generated sitemap at ${SITEMAP_OUTPUT_PATH} with ${recordsArray.length + 3} total links.`,
  );
};

generateSitemap();