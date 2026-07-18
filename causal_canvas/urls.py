from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('simulator.urls')),
]

# Добавляем раздачу статических файлов через Django
# (даже если DEBUG=False, это будет работать, пока STATIC_ROOT существует)
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)