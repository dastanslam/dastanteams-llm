from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),                     # Главная страница (HTML)
    path('api/chat/', views.api_master_chat, name='api_master_chat'),            # Чат
]