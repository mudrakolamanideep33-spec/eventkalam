# Eventkalam

Files (all in one folder):
- index.html : the website. Upload this to Hostinger public_html.
- schema.sql : run this in Supabase SQL Editor.
- index.js, package.json : the email server for Render.
- env.example : the settings the server needs (copy to .env on Render, never upload real keys).
- .gitignore : keeps secret .env files out of GitHub.

Steps
1. GitHub: private repo, upload these files.
2. Hostinger: upload index.html to public_html, then attach your domain.
3. Supabase: new project, run schema.sql, then make yourself admin (last line of the file).
4. Resend: verify your sender email, create an API key.
5. Render: new Web Service from this repo. Leave Root Directory empty, Build "npm install", Start "npm start". Add the variables listed in env.example.
6. Send the Supabase URL and anon key to connect the website to the real database.
