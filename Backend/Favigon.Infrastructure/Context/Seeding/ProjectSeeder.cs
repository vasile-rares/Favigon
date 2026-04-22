using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Seeding;

public static class ProjectSeeder
{
    public static async Task SeedAsync(FavigonDbContext context)
    {
        var targetUser = await context.Users.FirstOrDefaultAsync(u => u.Email == "raresmihail2004@gmail.com");
        if (targetUser == null)
        {
            return;
        }

        var existingProject = await context.Projects
            .FirstOrDefaultAsync(p => p.UserId == targetUser.Id && p.Slug == "favigon-demo-landing");

        if (existingProject != null)
        {
            // Always sync the latest demo design on startup
            existingProject.DesignJson = DemoDesignJson;
            await context.SaveChangesAsync();
            return;
        }

        var project = new Project
        {
            UserId = targetUser.Id,
            Name = "Favigon Demo — Landing Page",
            Slug = "favigon-demo-landing",
            IsPublic = true,
            DesignJson = DemoDesignJson,
        };

        context.Projects.Add(project);
        await context.SaveChangesAsync();
    }

    // Single page with two artboards side-by-side (Desktop 1440×900 + Mobile 390×1200).
    // Showcases: Layout (Yoga flex on frames, sections, nav groups, buttons, cards, icon-bgs),
    //            Effects (fadeIn/slideInBottom/scaleIn on load), Cursor (pointer on buttons),
    //            position:absolute for decorative glows inside flex containers.
    private static readonly string DemoDesignJson = """
    {
      "version": "3.0",
      "projectId": "demo",
      "activePageId": "page-1",
      "pages": [
        {
          "id": "page-1",
          "name": "Landing Page",
          "viewportPreset": "desktop",
          "viewportWidth": 1440,
          "viewportHeight": 900,
          "canvasX": 0,
          "canvasY": 0,
          "elements": [

            { "id": "frm", "type": "frame", "name": "Desktop \u2014 1440 \u00d7 900",
              "x": 0, "y": 0, "width": 1440, "height": 900,
              "fill": "#0f0f0f", "overflow": "clip",
              "display": "flex", "flexDirection": "column", "alignItems": "stretch",
              "visible": true, "parentId": null },

            { "id": "nav-bg", "type": "rectangle", "name": "Navbar",
              "x": 0, "y": 0, "width": 1440, "height": 72,
              "fill": "#111113", "stroke": "#27272a", "strokeWidth": 1,
              "strokeSides": { "top": false, "right": false, "bottom": true, "left": false },
              "display": "flex", "flexDirection": "row", "justifyContent": "space-between", "alignItems": "center",
              "padding": { "top": 0, "right": 48, "bottom": 0, "left": 48 },
              "visible": true, "parentId": "frm" },

            { "id": "nav-logo-grp", "type": "rectangle", "name": "Logo Group",
              "x": 0, "y": 0, "width": 132, "height": 28,
              "fill": "#111113",
              "display": "flex", "flexDirection": "row", "alignItems": "flex-end", "gap": 2,
              "visible": true, "parentId": "nav-bg" },

            { "id": "logo", "type": "text", "name": "Logo",
              "x": 0, "y": 0, "width": 120, "height": 28,
              "fill": "#ffffff", "fontSize": 22, "fontWeight": 700, "text": "Favigon",
              "visible": true, "parentId": "nav-logo-grp" },

            { "id": "logo-dot", "type": "rectangle", "name": "Logo Dot",
              "x": 0, "y": 0, "width": 6, "height": 6,
              "fill": "#6366f1", "cornerRadius": 3,
              "visible": true, "parentId": "nav-logo-grp" },

            { "id": "nav-links", "type": "rectangle", "name": "Nav Links",
              "x": 0, "y": 0, "width": 340, "height": 24,
              "fill": "#111113",
              "display": "flex", "flexDirection": "row", "alignItems": "center", "gap": 28,
              "visible": true, "parentId": "nav-bg" },

            { "id": "nav-features", "type": "text", "name": "Nav: Features",
              "x": 0, "y": 0, "width": 64, "height": 20,
              "fill": "#a1a1aa", "fontSize": 14, "text": "Features",
              "visible": true, "parentId": "nav-links" },

            { "id": "nav-canvas-lnk", "type": "text", "name": "Nav: Canvas",
              "x": 0, "y": 0, "width": 56, "height": 20,
              "fill": "#a1a1aa", "fontSize": 14, "text": "Canvas",
              "visible": true, "parentId": "nav-links" },

            { "id": "nav-export", "type": "text", "name": "Nav: Export",
              "x": 0, "y": 0, "width": 52, "height": 20,
              "fill": "#a1a1aa", "fontSize": 14, "text": "Export",
              "visible": true, "parentId": "nav-links" },

            { "id": "nav-pricing", "type": "text", "name": "Nav: Pricing",
              "x": 0, "y": 0, "width": 56, "height": 20,
              "fill": "#a1a1aa", "fontSize": 14, "text": "Pricing",
              "visible": true, "parentId": "nav-links" },

            { "id": "nav-btn", "type": "rectangle", "name": "Nav CTA",
              "x": 0, "y": 0, "width": 120, "height": 32,
              "fill": "#6366f1", "cornerRadius": 8, "cursor": "pointer",
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "nav-bg" },

            { "id": "nav-btn-t", "type": "text", "name": "Nav CTA Text",
              "x": 0, "y": 0, "width": 120, "height": 20,
              "fill": "#ffffff", "fontSize": 13, "fontWeight": 600,
              "text": "Get Started", "textAlign": "center",
              "visible": true, "parentId": "nav-btn" },

            { "id": "hero-section", "type": "rectangle", "name": "Hero Section",
              "x": 0, "y": 0, "width": 1440, "height": 480,
              "fill": "#0f0f0f",
              "display": "flex", "flexDirection": "column", "alignItems": "center", "gap": 16,
              "padding": { "top": 60, "right": 0, "bottom": 64, "left": 0 },
              "visible": true, "parentId": "frm" },

            { "id": "hero-glow", "type": "rectangle", "name": "Hero Glow",
              "x": 400, "y": 60, "width": 640, "height": 360,
              "fill": "#6366f1", "opacity": 0.07, "cornerRadius": 220,
              "position": "absolute",
              "visible": true, "parentId": "hero-section" },

            { "id": "badge", "type": "rectangle", "name": "Hero Badge",
              "x": 0, "y": 0, "width": 196, "height": 30,
              "fill": "#1e1b4b", "cornerRadius": 15, "stroke": "#4338ca", "strokeWidth": 1,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "hero-section" },

            { "id": "badge-t", "type": "text", "name": "Hero Badge Text",
              "x": 0, "y": 0, "width": 180, "height": 18,
              "fill": "#818cf8", "fontSize": 11, "fontWeight": 500,
              "text": "\u2728  Design & Code in Sync", "textAlign": "center",
              "visible": true, "parentId": "badge" },

            { "id": "hero-h", "type": "text", "name": "Hero Headline",
              "x": 0, "y": 0, "width": 1000, "height": 172,
              "fill": "#ffffff", "fontSize": 72, "fontWeight": 800,
              "text": "Design to Code.\nCode to Design.",
              "textAlign": "center", "lineHeight": 1.15, "lineHeightUnit": "em",
              "effects": [{ "preset": "fadeIn", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 24,
                "duration": 700, "delay": 0, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "hero-section" },

            { "id": "hero-sub", "type": "text", "name": "Hero Subtitle",
              "x": 0, "y": 0, "width": 720, "height": 54,
              "fill": "#71717a", "fontSize": 18,
              "text": "Build production-ready UIs visually. Export clean HTML, CSS or React.",
              "textAlign": "center",
              "effects": [{ "preset": "fadeIn", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 20,
                "duration": 600, "delay": 150, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "hero-section" },

            { "id": "cta-row", "type": "rectangle", "name": "CTA Row",
              "x": 0, "y": 0, "width": 380, "height": 52,
              "fill": "#0f0f0f",
              "display": "flex", "flexDirection": "row", "alignItems": "center", "gap": 20,
              "visible": true, "parentId": "hero-section" },

            { "id": "cta-primary", "type": "rectangle", "name": "CTA Primary",
              "x": 0, "y": 0, "width": 200, "height": 52,
              "fill": "#6366f1", "cornerRadius": 12,
              "shadow": "0 4px 20px 0 rgba(99,102,241,0.45)", "cursor": "pointer",
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "effects": [{ "preset": "scaleIn", "trigger": "onLoad",
                "opacity": 0, "scale": 0.85, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 0,
                "duration": 450, "delay": 300, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "cta-row" },

            { "id": "cta-primary-t", "type": "text", "name": "CTA Primary Text",
              "x": 0, "y": 0, "width": 200, "height": 26,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600,
              "text": "Start Building Free", "textAlign": "center",
              "visible": true, "parentId": "cta-primary" },

            { "id": "cta-secondary", "type": "rectangle", "name": "CTA Secondary",
              "x": 0, "y": 0, "width": 160, "height": 52,
              "fill": "#18181b", "cornerRadius": 12,
              "stroke": "#3f3f46", "strokeWidth": 1, "cursor": "pointer",
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "cta-row" },

            { "id": "cta-secondary-t", "type": "text", "name": "CTA Secondary Text",
              "x": 0, "y": 0, "width": 160, "height": 26,
              "fill": "#a1a1aa", "fontSize": 15,
              "text": "Watch Demo \u2192", "textAlign": "center",
              "visible": true, "parentId": "cta-secondary" },

            { "id": "features-section", "type": "rectangle", "name": "Features Section",
              "x": 0, "y": 0, "width": 1440, "height": 328,
              "fill": "#0f0f0f",
              "display": "flex", "flexDirection": "column", "alignItems": "center", "gap": 16,
              "padding": { "top": 24, "right": 0, "bottom": 53, "left": 0 },
              "visible": true, "parentId": "frm" },

            { "id": "divider", "type": "rectangle", "name": "Section Divider",
              "x": 0, "y": 0, "width": 1120, "height": 1,
              "fill": "#27272a", "visible": true, "parentId": "features-section" },

            { "id": "sec-title", "type": "text", "name": "Section Title",
              "x": 0, "y": 0, "width": 320, "height": 30,
              "fill": "#ffffff", "fontSize": 20, "fontWeight": 700,
              "text": "Why Favigon?", "textAlign": "center",
              "visible": true, "parentId": "features-section" },

            { "id": "cards-row", "type": "rectangle", "name": "Feature Cards",
              "x": 0, "y": 0, "width": 1120, "height": 188,
              "fill": "#0f0f0f",
              "display": "flex", "flexDirection": "row", "justifyContent": "space-between",
              "visible": true, "parentId": "features-section" },

            { "id": "card1", "type": "rectangle", "name": "Card: Visual Canvas",
              "x": 0, "y": 0, "width": 352, "height": 188,
              "fill": "#18181b", "cornerRadius": 16, "stroke": "#27272a", "strokeWidth": 1,
              "display": "flex", "flexDirection": "column", "alignItems": "flex-start", "gap": 8,
              "padding": { "top": 24, "right": 24, "bottom": 24, "left": 24 },
              "effects": [{ "preset": "slideInBottom", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 40,
                "duration": 500, "delay": 0, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "cards-row" },

            { "id": "card1-icon-bg", "type": "rectangle", "name": "Card1 Icon BG",
              "x": 0, "y": 0, "width": 40, "height": 40,
              "fill": "#1e1b4b", "cornerRadius": 10,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "card1" },

            { "id": "card1-icon", "type": "text", "name": "Card1 Icon",
              "x": 0, "y": 0, "width": 40, "height": 28,
              "fill": "#818cf8", "fontSize": 18, "text": "\ud83c\udfa8", "textAlign": "center",
              "visible": true, "parentId": "card1-icon-bg" },

            { "id": "card1-title", "type": "text", "name": "Card1 Title",
              "x": 0, "y": 0, "width": 304, "height": 22,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600, "text": "Visual Canvas",
              "visible": true, "parentId": "card1" },

            { "id": "card1-desc", "type": "text", "name": "Card1 Desc",
              "x": 0, "y": 0, "width": 304, "height": 56,
              "fill": "#71717a", "fontSize": 13,
              "text": "Compose UIs visually with a powerful design canvas and real-time preview.",
              "visible": true, "parentId": "card1" },

            { "id": "card2", "type": "rectangle", "name": "Card: Code Export",
              "x": 0, "y": 0, "width": 352, "height": 188,
              "fill": "#18181b", "cornerRadius": 16, "stroke": "#27272a", "strokeWidth": 1,
              "display": "flex", "flexDirection": "column", "alignItems": "flex-start", "gap": 8,
              "padding": { "top": 24, "right": 24, "bottom": 24, "left": 24 },
              "effects": [{ "preset": "slideInBottom", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 40,
                "duration": 500, "delay": 150, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "cards-row" },

            { "id": "card2-icon-bg", "type": "rectangle", "name": "Card2 Icon BG",
              "x": 0, "y": 0, "width": 40, "height": 40,
              "fill": "#1e1b4b", "cornerRadius": 10,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "card2" },

            { "id": "card2-icon", "type": "text", "name": "Card2 Icon",
              "x": 0, "y": 0, "width": 40, "height": 28,
              "fill": "#818cf8", "fontSize": 18, "text": "\u26a1", "textAlign": "center",
              "visible": true, "parentId": "card2-icon-bg" },

            { "id": "card2-title", "type": "text", "name": "Card2 Title",
              "x": 0, "y": 0, "width": 304, "height": 22,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600, "text": "Code Export",
              "visible": true, "parentId": "card2" },

            { "id": "card2-desc", "type": "text", "name": "Card2 Desc",
              "x": 0, "y": 0, "width": 304, "height": 56,
              "fill": "#71717a", "fontSize": 13,
              "text": "Export clean HTML, CSS or React code instantly, production-ready.",
              "visible": true, "parentId": "card2" },

            { "id": "card3", "type": "rectangle", "name": "Card: Sync",
              "x": 0, "y": 0, "width": 352, "height": 188,
              "fill": "#18181b", "cornerRadius": 16, "stroke": "#27272a", "strokeWidth": 1,
              "display": "flex", "flexDirection": "column", "alignItems": "flex-start", "gap": 8,
              "padding": { "top": 24, "right": 24, "bottom": 24, "left": 24 },
              "effects": [{ "preset": "slideInBottom", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 40,
                "duration": 500, "delay": 300, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "cards-row" },

            { "id": "card3-icon-bg", "type": "rectangle", "name": "Card3 Icon BG",
              "x": 0, "y": 0, "width": 40, "height": 40,
              "fill": "#1e1b4b", "cornerRadius": 10,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "card3" },

            { "id": "card3-icon", "type": "text", "name": "Card3 Icon",
              "x": 0, "y": 0, "width": 40, "height": 28,
              "fill": "#818cf8", "fontSize": 18, "text": "\ud83d\udd01", "textAlign": "center",
              "visible": true, "parentId": "card3-icon-bg" },

            { "id": "card3-title", "type": "text", "name": "Card3 Title",
              "x": 0, "y": 0, "width": 304, "height": 22,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600, "text": "Bidirectional Sync",
              "visible": true, "parentId": "card3" },

            { "id": "card3-desc", "type": "text", "name": "Card3 Desc",
              "x": 0, "y": 0, "width": 304, "height": 56,
              "fill": "#71717a", "fontSize": 13,
              "text": "Changes on canvas reflect in code and vice versa, always in sync.",
              "visible": true, "parentId": "card3" },

            { "id": "footer", "type": "text", "name": "Footer",
              "x": 0, "y": 0, "width": 1440, "height": 20,
              "fill": "#52525b", "fontSize": 13,
              "text": "\u00a9 2026 Favigon \u2014 Design meets code.", "textAlign": "center",
              "visible": true, "parentId": "frm" },

            { "id": "frm-m", "type": "frame", "name": "Mobile \u2014 390 \u00d7 1200",
              "x": 1560, "y": 0, "width": 390, "height": 1200,
              "fill": "#0f0f0f", "overflow": "clip",
              "display": "flex", "flexDirection": "column", "alignItems": "stretch",
              "visible": true, "parentId": null },

            { "id": "m-nav", "type": "rectangle", "name": "Mobile Navbar",
              "x": 0, "y": 0, "width": 390, "height": 60,
              "fill": "#111113", "stroke": "#27272a", "strokeWidth": 1,
              "strokeSides": { "top": false, "right": false, "bottom": true, "left": false },
              "display": "flex", "flexDirection": "row", "justifyContent": "space-between", "alignItems": "center",
              "padding": { "top": 0, "right": 20, "bottom": 0, "left": 20 },
              "visible": true, "parentId": "frm-m" },

            { "id": "m-nav-logo-grp", "type": "rectangle", "name": "Mobile Logo Group",
              "x": 0, "y": 0, "width": 112, "height": 26,
              "fill": "#111113",
              "display": "flex", "flexDirection": "row", "alignItems": "flex-end", "gap": 2,
              "visible": true, "parentId": "m-nav" },

            { "id": "m-logo", "type": "text", "name": "Mobile Logo",
              "x": 0, "y": 0, "width": 100, "height": 26,
              "fill": "#ffffff", "fontSize": 20, "fontWeight": 700, "text": "Favigon",
              "visible": true, "parentId": "m-nav-logo-grp" },

            { "id": "m-logo-dot", "type": "rectangle", "name": "Mobile Logo Dot",
              "x": 0, "y": 0, "width": 6, "height": 6,
              "fill": "#6366f1", "cornerRadius": 3,
              "visible": true, "parentId": "m-nav-logo-grp" },

            { "id": "m-hamburger", "type": "rectangle", "name": "Hamburger Menu",
              "x": 0, "y": 0, "width": 22, "height": 16,
              "fill": "#111113",
              "display": "flex", "flexDirection": "column", "justifyContent": "space-between", "alignItems": "flex-start",
              "visible": true, "parentId": "m-nav" },

            { "id": "m-menu-line1", "type": "rectangle", "name": "Menu Line 1",
              "x": 0, "y": 0, "width": 22, "height": 2,
              "fill": "#a1a1aa", "cornerRadius": 1, "visible": true, "parentId": "m-hamburger" },

            { "id": "m-menu-line2", "type": "rectangle", "name": "Menu Line 2",
              "x": 0, "y": 0, "width": 18, "height": 2,
              "fill": "#a1a1aa", "cornerRadius": 1, "visible": true, "parentId": "m-hamburger" },

            { "id": "m-menu-line3", "type": "rectangle", "name": "Menu Line 3",
              "x": 0, "y": 0, "width": 22, "height": 2,
              "fill": "#a1a1aa", "cornerRadius": 1, "visible": true, "parentId": "m-hamburger" },

            { "id": "m-hero-section", "type": "rectangle", "name": "Mobile Hero Section",
              "x": 0, "y": 0, "width": 390, "height": 452,
              "fill": "#0f0f0f",
              "display": "flex", "flexDirection": "column", "alignItems": "center", "gap": 16,
              "padding": { "top": 48, "right": 20, "bottom": 40, "left": 20 },
              "visible": true, "parentId": "frm-m" },

            { "id": "m-glow", "type": "rectangle", "name": "Mobile Hero Glow",
              "x": 55, "y": 40, "width": 280, "height": 280,
              "fill": "#6366f1", "opacity": 0.08, "cornerRadius": 140,
              "position": "absolute",
              "visible": true, "parentId": "m-hero-section" },

            { "id": "m-badge", "type": "rectangle", "name": "Mobile Badge",
              "x": 0, "y": 0, "width": 196, "height": 28,
              "fill": "#1e1b4b", "cornerRadius": 14, "stroke": "#4338ca", "strokeWidth": 1,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "m-hero-section" },

            { "id": "m-badge-t", "type": "text", "name": "Mobile Badge Text",
              "x": 0, "y": 0, "width": 180, "height": 16,
              "fill": "#818cf8", "fontSize": 11, "fontWeight": 500,
              "text": "\u2728  Design & Code in Sync", "textAlign": "center",
              "visible": true, "parentId": "m-badge" },

            { "id": "m-hero-h", "type": "text", "name": "Mobile Headline",
              "x": 0, "y": 0, "width": 350, "height": 96,
              "fill": "#ffffff", "fontSize": 40, "fontWeight": 800,
              "text": "Design to Code.\nCode to Design.",
              "textAlign": "center", "lineHeight": 1.2, "lineHeightUnit": "em",
              "effects": [{ "preset": "fadeIn", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 20,
                "duration": 700, "delay": 0, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "m-hero-section" },

            { "id": "m-hero-sub", "type": "text", "name": "Mobile Subtitle",
              "x": 0, "y": 0, "width": 350, "height": 72,
              "fill": "#71717a", "fontSize": 15,
              "text": "Build UIs visually. Export clean HTML, CSS or React instantly.",
              "textAlign": "center", "visible": true, "parentId": "m-hero-section" },

            { "id": "m-cta", "type": "rectangle", "name": "Mobile CTA",
              "x": 0, "y": 0, "width": 350, "height": 52,
              "fill": "#6366f1", "cornerRadius": 12,
              "shadow": "0 4px 20px 0 rgba(99,102,241,0.45)", "cursor": "pointer",
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "effects": [{ "preset": "scaleIn", "trigger": "onLoad",
                "opacity": 0, "scale": 0.85, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 0,
                "duration": 450, "delay": 200, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "m-hero-section" },

            { "id": "m-cta-t", "type": "text", "name": "Mobile CTA Text",
              "x": 0, "y": 0, "width": 350, "height": 26,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600,
              "text": "Start Building Free", "textAlign": "center",
              "visible": true, "parentId": "m-cta" },

            { "id": "m-cta2", "type": "rectangle", "name": "Mobile CTA 2",
              "x": 0, "y": 0, "width": 350, "height": 52,
              "fill": "#18181b", "cornerRadius": 12,
              "stroke": "#3f3f46", "strokeWidth": 1, "cursor": "pointer",
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "m-hero-section" },

            { "id": "m-cta2-t", "type": "text", "name": "Mobile CTA 2 Text",
              "x": 0, "y": 0, "width": 350, "height": 26,
              "fill": "#a1a1aa", "fontSize": 15,
              "text": "Watch Demo \u2192", "textAlign": "center",
              "visible": true, "parentId": "m-cta2" },

            { "id": "m-features-section", "type": "rectangle", "name": "Mobile Features Section",
              "x": 0, "y": 0, "width": 390, "height": 645,
              "fill": "#0f0f0f",
              "display": "flex", "flexDirection": "column", "alignItems": "center", "gap": 16,
              "padding": { "top": 24, "right": 0, "bottom": 24, "left": 0 },
              "visible": true, "parentId": "frm-m" },

            { "id": "m-div", "type": "rectangle", "name": "Mobile Divider",
              "x": 0, "y": 0, "width": 350, "height": 1,
              "fill": "#27272a", "visible": true, "parentId": "m-features-section" },

            { "id": "m-sec-t", "type": "text", "name": "Mobile Section Title",
              "x": 0, "y": 0, "width": 350, "height": 28,
              "fill": "#ffffff", "fontSize": 18, "fontWeight": 700,
              "text": "Why Favigon?", "textAlign": "center",
              "visible": true, "parentId": "m-features-section" },

            { "id": "m-cards-col", "type": "rectangle", "name": "Mobile Feature Cards",
              "x": 0, "y": 0, "width": 350, "height": 536,
              "fill": "#0f0f0f",
              "display": "flex", "flexDirection": "column", "gap": 16,
              "visible": true, "parentId": "m-features-section" },

            { "id": "m-card1", "type": "rectangle", "name": "Mobile Card 1",
              "x": 0, "y": 0, "width": 350, "height": 168,
              "fill": "#18181b", "cornerRadius": 16, "stroke": "#27272a", "strokeWidth": 1,
              "display": "flex", "flexDirection": "column", "alignItems": "flex-start", "gap": 8,
              "padding": { "top": 20, "right": 20, "bottom": 20, "left": 20 },
              "effects": [{ "preset": "slideInBottom", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 30,
                "duration": 500, "delay": 0, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "m-cards-col" },

            { "id": "m-card1-icon-bg", "type": "rectangle", "name": "Mobile Card1 Icon BG",
              "x": 0, "y": 0, "width": 38, "height": 38,
              "fill": "#1e1b4b", "cornerRadius": 9,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "m-card1" },

            { "id": "m-card1-icon", "type": "text", "name": "Mobile Card1 Icon",
              "x": 0, "y": 0, "width": 38, "height": 26,
              "fill": "#818cf8", "fontSize": 16, "text": "\ud83c\udfa8", "textAlign": "center",
              "visible": true, "parentId": "m-card1-icon-bg" },

            { "id": "m-card1-title", "type": "text", "name": "Mobile Card1 Title",
              "x": 0, "y": 0, "width": 310, "height": 22,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600, "text": "Visual Canvas",
              "visible": true, "parentId": "m-card1" },

            { "id": "m-card1-desc", "type": "text", "name": "Mobile Card1 Desc",
              "x": 0, "y": 0, "width": 310, "height": 52,
              "fill": "#71717a", "fontSize": 13,
              "text": "Compose UIs visually with a powerful design canvas.",
              "visible": true, "parentId": "m-card1" },

            { "id": "m-card2", "type": "rectangle", "name": "Mobile Card 2",
              "x": 0, "y": 0, "width": 350, "height": 168,
              "fill": "#18181b", "cornerRadius": 16, "stroke": "#27272a", "strokeWidth": 1,
              "display": "flex", "flexDirection": "column", "alignItems": "flex-start", "gap": 8,
              "padding": { "top": 20, "right": 20, "bottom": 20, "left": 20 },
              "effects": [{ "preset": "slideInBottom", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 30,
                "duration": 500, "delay": 150, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "m-cards-col" },

            { "id": "m-card2-icon-bg", "type": "rectangle", "name": "Mobile Card2 Icon BG",
              "x": 0, "y": 0, "width": 38, "height": 38,
              "fill": "#1e1b4b", "cornerRadius": 9,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "m-card2" },

            { "id": "m-card2-icon", "type": "text", "name": "Mobile Card2 Icon",
              "x": 0, "y": 0, "width": 38, "height": 26,
              "fill": "#818cf8", "fontSize": 16, "text": "\u26a1", "textAlign": "center",
              "visible": true, "parentId": "m-card2-icon-bg" },

            { "id": "m-card2-title", "type": "text", "name": "Mobile Card2 Title",
              "x": 0, "y": 0, "width": 310, "height": 22,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600, "text": "Code Export",
              "visible": true, "parentId": "m-card2" },

            { "id": "m-card2-desc", "type": "text", "name": "Mobile Card2 Desc",
              "x": 0, "y": 0, "width": 310, "height": 52,
              "fill": "#71717a", "fontSize": 13,
              "text": "Export clean HTML, CSS or React code instantly.",
              "visible": true, "parentId": "m-card2" },

            { "id": "m-card3", "type": "rectangle", "name": "Mobile Card 3",
              "x": 0, "y": 0, "width": 350, "height": 168,
              "fill": "#18181b", "cornerRadius": 16, "stroke": "#27272a", "strokeWidth": 1,
              "display": "flex", "flexDirection": "column", "alignItems": "flex-start", "gap": 8,
              "padding": { "top": 20, "right": 20, "bottom": 20, "left": 20 },
              "effects": [{ "preset": "slideInBottom", "trigger": "onLoad",
                "opacity": 0, "scale": 1, "rotate": 0, "rotationMode": "2d",
                "skewX": 0, "skewY": 0, "offsetX": 0, "offsetY": 30,
                "duration": 500, "delay": 300, "iterations": 1,
                "easing": "ease-out", "direction": "normal",
                "fillMode": "forwards", "offScreenBehavior": "play" }],
              "visible": true, "parentId": "m-cards-col" },

            { "id": "m-card3-icon-bg", "type": "rectangle", "name": "Mobile Card3 Icon BG",
              "x": 0, "y": 0, "width": 38, "height": 38,
              "fill": "#1e1b4b", "cornerRadius": 9,
              "display": "flex", "justifyContent": "center", "alignItems": "center",
              "visible": true, "parentId": "m-card3" },

            { "id": "m-card3-icon", "type": "text", "name": "Mobile Card3 Icon",
              "x": 0, "y": 0, "width": 38, "height": 26,
              "fill": "#818cf8", "fontSize": 16, "text": "\ud83d\udd01", "textAlign": "center",
              "visible": true, "parentId": "m-card3-icon-bg" },

            { "id": "m-card3-title", "type": "text", "name": "Mobile Card3 Title",
              "x": 0, "y": 0, "width": 310, "height": 22,
              "fill": "#ffffff", "fontSize": 15, "fontWeight": 600, "text": "Bidirectional Sync",
              "visible": true, "parentId": "m-card3" },

            { "id": "m-card3-desc", "type": "text", "name": "Mobile Card3 Desc",
              "x": 0, "y": 0, "width": 310, "height": 52,
              "fill": "#71717a", "fontSize": 13,
              "text": "Changes on canvas reflect in code and vice versa, always in sync.",
              "visible": true, "parentId": "m-card3" },

            { "id": "m-footer", "type": "text", "name": "Mobile Footer",
              "x": 0, "y": 0, "width": 390, "height": 20,
              "fill": "#52525b", "fontSize": 12,
              "text": "\u00a9 2026 Favigon \u2014 Design meets code.", "textAlign": "center",
              "visible": true, "parentId": "frm-m" }

          ]
        }
      ]
    }
    """;
}
