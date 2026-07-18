from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('simulator.urls')),
    path('', include('simulator.urls')),  # для отображения шаблона, но мы сделаем отдельно
]