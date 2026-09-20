# moonbag.miono.live

## Status

- **Bankr agent skill:** implemented and available in `../bankr-moonbag/`
- **Regular-wallet router:** **NOT IMPLEMENTED YET**. It is currently a product/architecture concept only. Do not describe it as live, usable, or deployed.

Static landing/explainer for two Moonbag implementations:

1. **Bankr agent skill** — live at https://github.com/dutchiono/skills/tree/main/bankr-moonbag
2. **Regular-wallet router** — product/architecture explainer pending transaction-layer deployment

## Deploy

Serve `index.html` as a static site at `moonbag.miono.live`.

Example nginx server block:

```nginx
server {
    server_name moonbag.miono.live;
    root /var/www/moonbag.miono.live;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Then point the `moonbag` DNS record at the same host as `miono.live` and provision TLS (for example with the host's existing certbot/Caddy setup).
