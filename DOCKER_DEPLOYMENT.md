# 🐳 OMG Rome - Guida Deployment Docker

## 📋 Prerequisiti

- Docker Desktop installato e in esecuzione
- Docker Compose disponibile
- Porta 3100 libera (o modificare la configurazione)

## 🚀 Avvio Rapido

### 1. Build dell'Immagine
```bash
# Costruisci l'immagine Docker
docker-compose build --no-cache
```

### 2. Avvio del Container
```bash
# Avvia il container in background
docker-compose up -d

# Verifica lo stato
docker-compose ps
```

### 3. Test del Servizio
```bash
# Test endpoint di salute
curl http://localhost:3100/health

# Test flusso rapido
curl "http://localhost:3100/proxy/youtube/VIDEO_ID?quality=fast"

# Test richiesta HEAD
curl -I "http://localhost:3100/proxy/youtube/VIDEO_ID?quality=best"
```

## 🔧 Configurazione

### Porte
- **Container interno**: 3100 (fisso)
- **Host esterno**: 3100 (modificabile in `docker-compose.yml`)

### Variabili d'Ambiente
```yaml
environment:
  - NODE_ENV=production
  - PORT=3100
```

### Volumi
- `./logs:/app/logs` - Log dell'applicazione

## 📊 Monitoraggio

### Log del Container
```bash
# Log in tempo reale
docker-compose logs -f

# Ultimi 50 log
docker-compose logs --tail=50

# Log specifici
docker-compose logs omg-rome
```

### Stato del Container
```bash
# Stato e risorse
docker stats omg-rome

# Processi interni
docker exec -it omg-rome ps aux
```

## 🛠️ Gestione

### Riavvio
```bash
# Riavvio completo
docker-compose restart

# Riavvio con rebuild
docker-compose down
docker-compose up -d --build
```

### Aggiornamenti
```bash
# Pull ultime modifiche
git pull origin main

# Rebuild e riavvio
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Pulizia
```bash
# Rimuovi container e network
docker-compose down

# Rimuovi anche volumi (ATTENZIONE: perde i log)
docker-compose down -v

# Pulizia completa Docker
docker system prune -a
```

## 🔍 Troubleshooting

### Porta Occupata
```bash
# Trova processo che occupa la porta
lsof -ti:3100

# Termina processo
kill -9 $(lsof -ti:3100)
```

### Container Non Si Avvia
```bash
# Verifica log di avvio
docker-compose logs

# Verifica configurazione
docker-compose config

# Test manuale
docker run --rm -p 3100:3100 omg-rome:latest
```

### Problemi di Rete
```bash
# Verifica network Docker
docker network ls

# Ricrea network
docker-compose down
docker network prune
docker-compose up -d
```

## 📈 Performance

### Ottimizzazioni Docker
- **Build multi-stage**: Non implementato (possibile miglioramento futuro)
- **Cache npm**: Utilizza `--production` per installazione veloce
- **Layer caching**: Ottimizzato per dipendenze Node.js

### Monitoraggio Risorse
```bash
# Monitora CPU, memoria e rete
docker stats omg-rome

# Analisi dettagliata
docker exec -it omg-rome top
```

## 🔒 Sicurezza

### Best Practices
- Container eseguito come utente non-root
- Porte esposte limitate al minimo necessario
- Immagine basata su `node:20-bookworm-slim` (Debian)
- Aggiornamenti di sicurezza automatici per base image

### Firewall
```bash
# UFW (Ubuntu)
sudo ufw allow 3100

# iptables
sudo iptables -A INPUT -p tcp --dport 3100 -j ACCEPT
```

## 🌐 Produzione

### Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSL/TLS con Let's Encrypt
```bash
# Installazione certbot
sudo apt install certbot python3-certbot-nginx

# Certificato SSL
sudo certbot --nginx -d your-domain.com
```

### Monitoraggio Produzione
- **Health checks**: `/health` endpoint
- **Log rotation**: Configurato in volume Docker
- **Backup**: Volume `./logs` per persistenza

## 📚 Comandi Utili

### Docker Compose
```bash
# Avvio
docker-compose up -d

# Stop
docker-compose down

# Logs
docker-compose logs -f

# Status
docker-compose ps

# Rebuild
docker-compose build --no-cache
```

### Docker
```bash
# Immagini
docker images

# Container attivi
docker ps

# Container tutti
docker ps -a

# Log container
docker logs omg-rome

# Shell container
docker exec -it omg-rome /bin/bash
```

## 🎯 Test Completati

✅ **Build immagine**: Successo  
✅ **Avvio container**: Successo  
✅ **Endpoint health**: Funzionante  
✅ **Flusso rapido**: Solo estrazione URL (no yt-dlp streaming)  
✅ **Richieste HEAD**: Risposta immediata senza processing  
✅ **Performance**: Ottimizzate per tutti i tipi di richiesta  

## 🚀 Prossimi Passi

1. **Deployment produzione** con reverse proxy
2. **Monitoraggio avanzato** con Prometheus/Grafana
3. **Load balancing** per alta disponibilità
4. **CI/CD pipeline** per deployment automatico

---

**OMG Rome v1.0.0** - Gateway di streaming ottimizzato per addon Stremio 🎬✨
