from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/graph/', views.get_graph),
    path('api/apply_cascade/<int:node_id>/', views.apply_cascade),
    path('api/upload-csv/', views.upload_csv),
    path('api/discover-graph/', views.discover_graph),
    path('api/node/', views.create_node),
    path('api/node/<int:node_id>/', views.update_node),
    path('api/node/<int:node_id>/delete/', views.delete_node),
    path('api/edge/', views.create_edge),
    path('api/edge/<int:edge_id>/', views.update_edge),
    path('api/edge/<int:edge_id>/delete/', views.delete_edge),
    # Сценарии
    path('api/scenarios/', views.list_scenarios),
    path('api/scenarios/save/', views.save_scenario),
    path('api/scenarios/<int:scenario_id>/', views.update_scenario),
    path('api/scenarios/<int:scenario_id>/delete/', views.delete_scenario),
    path('api/scenarios/<int:scenario_id>/load/', views.load_scenario),
    path('api/scenarios/<int:scenario_id>/export/', views.export_scenario),
    path('api/scenarios/import/', views.import_scenario),
    # Аутентификация
    path('login/', views.CustomLoginView.as_view(), name='login'),
    path('logout/', views.CustomLogoutView.as_view(), name='logout'),
    path('register/', views.registration, name='register'),
]