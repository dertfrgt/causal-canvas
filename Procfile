release: python manage.py migrate && python manage.py collectstatic --noinput
web: gunicorn causal_canvas.wsgi:application --worker-class sync --timeout 300