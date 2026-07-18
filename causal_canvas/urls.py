from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('simulator.urls')),
]

# Раздача статики (работает даже при DEBUG=False)
urlpatterns += [
    path('static/<path:path>', serve, {'document_root': settings.STATIC_ROOT}),
]