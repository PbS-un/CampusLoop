# ReHome

ReHome is a University of Macau student exchange app built with React and Vite. It has no server: all posts, replies and handovers are saved in the visitor's own browser, and the other students are simulated. Its interface is available in English, Traditional Chinese, Simplified Chinese, and European Portuguese. The sample listings and messages are fictional.

## Run locally

Install Node.js 22 or newer, then run these commands from the project folder.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The app starts with sample data and saves your changes in this browser's local storage, so they are still there after a reload. Run `npm test` for the discovery and local demo tests, or `npm run build` for the GitHub Pages build in `dist/`.

## Configure GitHub Pages

1. Create a GitHub repository named `CampusLoop`, or use your existing repository. Upload the **contents** of this folder to the root of its `main` branch, including `.github/workflows/pages.yml` and `package-lock.json`. Keep `node_modules` and `dist` out of the repository.
2. Open **Settings → Pages** and choose **GitHub Actions** under **Build and deployment → Source**.
3. Go to **Actions → Deploy ReHome → Run workflow**, then open the link in the deployment result after it succeeds. For a repository named `CampusLoop`, the project site normally uses `https://<owner>.github.io/CampusLoop/`.

If you are pushing a new local repository from the command line, replace `<owner>` with your GitHub username or organization:

```sh
git init -b main
git add .
git commit -m "Build ReHome web app"
git remote add origin https://github.com/<owner>/CampusLoop.git
git push -u origin main
```

## Try the coursework flows

Add one of the following queries to the local URL or the GitHub Pages URL. These scenarios reset on reload and use isolated simulated data for each session.

| URL query | Task and success condition |
| --- | --- |
| `?test=discovery` | Open **Requests**, search for `desk lamp`, and filter to **Study** and **Free**. Open **Free desk lamp for studying** and verify the requester and terms. |
| `?test=recovery` | In **Inbox → Handovers**, open the cancelled handover for **Introduction to Algorithms**. Confirm the book is still with the owner to relist it. The previous conversation remains accessible. |
| `?test=retrieval` | Repeat the second task with the book at the library pickup point. Keep the listing closed until the scenario states that the book has been retrieved, then reopen it. |

Without a URL query, the app opens the normal demo with every **Simulate …** button. Its data stays in your browser: other visitors cannot see your posts, and you cannot see theirs. Clearing the site's browser data, or using another browser or device, starts again from the sample data.

To practise a handover, open a sample offer and select **Try a demo handover**. The simulated owner accepts your proposal. From there you can cancel, or simulate the owner handing the item to you in person or leaving it at the pickup point, then confirm receipt. The demo handover stays on the same page and is saved in **Inbox → Handovers** with your other data. To practise relisting from the normal homepage, go to **Inbox → Handovers** and open the cancelled sample *Introduction to Algorithms*. After you relist it, it appears in **Discover → Offers** and you can select **Simulate someone wanting this item** to hand it over like your own posts. **Reset demo** in **Inbox** closes the sample listing again, removes demo handovers and replies to sample requests, and makes the sample offers available again. Your own listings are not changed.

To answer a request, open it and select **I have one to offer**. The reply is linked to that request and is visible only to the two participants in **Inbox → Request replies**. The sender can withdraw it with **Withdraw offer** and a second confirmation; the requester then no longer sees it. The reply stays in your browser until you withdraw it or select **Reset demo**. To practise what happens next, open the reply in **Inbox → Request replies** and select **Simulate the requester accepting**. Then choose **Arrange time and place**; the simulated requester agrees to it. On the handover page you are the giver: **I’ve left the item at the pickup point**, then **Simulate the requester confirming receipt** to complete it. You can also send messages or cancel. Once a reply is part of a handover it can no longer be withdrawn; cancel the handover instead.

To see how others respond to your own post, open the post after publishing it. A shared offer shows **Simulate someone wanting this item**: a simulated student proposes a time and place, which you can accept, then leave the item at the pickup point and simulate the other person confirming receipt. A shared request shows **Simulate someone having this item**: a simulated student replies, and you can **Accept this offer**, arrange a time and place, simulate the other person leaving the item, and confirm receipt. Posts visible only to you cannot receive simulated responses. **Reset demo** removes these demo handovers and replies and makes your posts available again.

An offer needs only four details, as Report 3 (R-U1) specifies: a **Photo**, at least one category, the **Condition** and a **Pickup area**. Large photos are resized automatically. The pickup area is remembered for your next offer and is suggested as the meeting place when someone arranges a handover. The title, description, price and pickup times are under **More details (optional)**; without a title, the category name is used. Requests still need a title, description and category.

Details left out when publishing must be added before a handover is confirmed (R-F2). If someone proposes a handover for an offer without a description, both people see what is missing, **Accept proposal** stays disabled, and the owner can select **Add details** to complete the post without losing the proposal. Once the handover is confirmed, the post can no longer be edited.

An owner can also decide not to pass an item on (N5). **Keep this item for now** hides an available offer from others and marks it **Kept**, which is separate from **Closed** after a cancelled handover. **Offer it again** makes it available with the same details; pickup times that have passed are removed. An item cannot be kept while a handover is in progress; cancel the handover first.

When posting, you must choose who can see the post under **Who can see this?** (nothing is preselected; if you have set your residential college, **Students in my college** is suggested): **UM students** (the shared feed), **Students in my college**, or **Only me**. A college-only post is shown only to people who chose the same residential college under **My residential college**, which you can set on the post form or in **My listings**. The college is self-declared and not verified. To see a college-only post from the other side, choose **Cheng Yu Tung College** as your college: the sample offer *Electric kettle for the floor pantry* then appears in **Discover** with a *Cheng Yu Tung College only* label, and disappears again if you choose another college.

To delete one of your own listings, open **My listings**, select **Delete listing**, and confirm with **Delete permanently**. Deletion is blocked while a handover is in progress, and it also removes the listing's past handovers, messages and request replies. Closed listings can be deleted too. Deleting the sample *Introduction to Algorithms* only hides it in this browser; **Reset demo** in **Inbox** brings it back.

GitHub Pages setup: [Vite static deployment](https://vite.dev/guide/static-deploy.html#github-pages).
