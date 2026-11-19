# Kefada Fashion website

A free website for your kids clothing store. Customers browse, filter by collection, genre and size, pick a size and order on WhatsApp.

## What is in this folder

| File or folder | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The website itself. You do not need to open these. |
| `config.js` | Your settings: WhatsApp number, Instagram, Google Sheet link. |
| `products-data.js` | A saved copy of your first 6 items. Used until you link the Google Sheet. |
| `assets/logo.jpg` | Your main (circle) logo. |
| `assets/favicon*.png`, `favicon.ico`, `apple-touch-icon.png` | The small KF icon shown on the browser tab. |
| `images/` | Put your product photos here. |
| `build-item-pages.mjs` and `.github/` | Automatically build a small page and preview picture for each item, so WhatsApp can show the photo. Part 5. |

## 1. Test on your computer first

1. Put your photos in the `images` folder.
2. Double-click `index.html`. It opens in your browser.

Photo names must match the "Photo file names" column in your sheet **exactly, including capital letters**. `129039K.jpg` and `129039k.jpg` are different names. If a photo is missing, the card shows "Photo coming soon".

## 2. Put the site online (free, GitHub Pages)

1. Go to github.com and create a free account.
2. Click **+** (top right), then **New repository**. Name it `kefada`, choose **Public**, and click **Create repository**.
3. Click **uploading an existing file**. Drag in everything from inside this folder (`index.html`, `style.css`, `app.js`, `config.js`, `products-data.js`, the `assets` folder and the `images` folder). Click **Commit changes**.
   GitHub accepts up to 100 files at a time in the browser, so upload photos in batches if you have many.
4. Open **Settings**, then **Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, and click **Save**.
5. Wait 1 to 2 minutes. Your site address appears on that page, like `https://YOURNAME.github.io/kefada/`.

The photo link that customers send you on WhatsApp is built automatically from this address.

## 3. Link your Google Sheet (so updates show without re-uploading)

1. Go to drive.google.com, click **New**, then **File upload**, and choose your Excel file.
2. Right-click the file, then **Open with**, then **Google Sheets**.
3. Select the **Available sizes** and **Photo file names** columns. Click **Format**, then **Number**, then **Plain text**. This stops Google turning `3,5` into a number.
4. Click **File**, then **Share**, then **Publish to web**. On the **Link** tab, choose the **Products** sheet (not "Entire document") and **Comma-separated values (.csv)**. Click **Publish** and copy the link.
5. In GitHub, open `config.js` and click the pencil icon. Paste the link between the quotes after `sheetCsvUrl:`. Click **Commit changes**.

After this, the site reads your sheet. Changes show on the site within a few minutes (Google refreshes published sheets about every 5 minutes).

If the sheet cannot be read, the site falls back to the saved items in `products-data.js`.

## 4. Updating later

- **Prices, sizes, quantities, sales, new items:** change them in the Google Sheet. Nothing to upload.
- **New photos:** in GitHub open the `images` folder, click **Add file**, then **Upload files**.
- **Instagram:** in `config.js`, type your username between the quotes after `instagram:` and commit.
- **Design changes or new features:** ask Claude, and send the files or the GitHub link.

## 5. Photo preview in WhatsApp (item pages)

WhatsApp does not let a website attach a picture to a message. Instead, each order message contains a link to a small page for that item. WhatsApp turns the link into a card with the item's photo, name and price.

These pages are built automatically on GitHub from your Google Sheet. They also make a small copy of each main photo (under 250 KB), because WhatsApp ignores big photos.

One-time setup:
1. Upload `build-item-pages.mjs`, `app.js` and `config.js` to your repository (they replace the old ones).
2. In your repository click **Add file**, then **Create new file**. In the name box type `.github/workflows/build-item-pages.yml` (typing the slashes creates the folders). Paste the contents of the `build-item-pages.yml` file and click **Commit changes**.
3. Click the **Actions** tab. If GitHub asks, click the button to enable workflows. Open **Build item pages**, click **Run workflow**, then **Run workflow** again.
4. After about a minute, new folders called `item` and `previews` appear in your repository. Test by opening your site address plus `item/`, an item code and `.html`, for example `https://kefada-fa.github.io/Kefada/item/312463K.html`.

After that it runs by itself: when you upload files, and every 30 minutes to catch sheet changes. A new item's page can take up to 30 minutes to appear. You can also click **Run workflow** to update right away.

If the run fails with a permission error: **Settings**, then **Actions**, then **General**, then **Workflow permissions**, choose **Read and write permissions**, and save. Then run it again.

WhatsApp remembers a link's preview for a while. If you change an item's photo, the old preview may stay for some days.

## How the sheet is read

- One row is one item. Rows with no Name are ignored. "Show on site" set to **No** hides an item.
- **Quantity** 0 means sold out. A quantity of 3 or less shows "Only N left" (change this in `config.js`).
- A **Sale price** lower than the Price starts a sale.
- On-sale items go to the top and sold-out items to the end. Inside each group the newest row of the sheet comes first (the last row you add shows first, row 1 shows last).
- The Collection and Genre filters only show values that have items. A "Baby" button appears once you add a Baby item.
- Photo file names are separated by commas. The first one is the main photo and the one sent in the WhatsApp message.
