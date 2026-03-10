# Future: Importing Reviews from External Sources

Many users have asked about importing or displaying reviews for churches. This document captures options for a future implementation.

## Google Places API

- **What:** Google Places (Maps) stores business listings and user reviews, including many churches.
- **How:** Use the [Places API](https://developers.google.com/maps/documentation/places/web-service) (e.g. Place Details or Find Place) to match a church by name/address and fetch its `reviews` and `rating`.
- **Considerations:**
  - API key and billing (quota/cost per request).
  - Matching our church records to a Place ID (by name + address or lat/lng) can be fuzzy; need a matching and dedup strategy.
  - Display and attribution must follow [Google’s attribution requirements](https://developers.google.com/maps/documentation/places/web-service/policies#attribution).
- **Use case:** Show star rating and snippet of reviews (or link to Google) on the church detail panel.

## Facebook

- **What:** Facebook Pages for churches often have ratings and reviews.
- **How:** Use the [Facebook Graph API](https://developers.facebook.com/docs/graph-api) (e.g. Page node with `overall_star_rating` and related fields) if the church has a linked Facebook Page.
- **Considerations:**
  - Requires a Facebook App and appropriate permissions; review and rate limits apply.
  - Not every church has a Page or public ratings.
  - Need a way to associate our church record to a Facebook Page (manual mapping, URL field, or search).
- **Use case:** Surface Facebook rating or review summary alongside other signals.

## Relation to Current Product

The app currently uses a simple **Netflix-style reaction system** (Not for me / I like it / I love it) for lightweight, first-party feedback. Imported reviews from Google or Facebook could later be combined with or shown alongside these reactions (e.g. “Community reactions” vs “Google rating”) with clear attribution and links to the source.
