from django.db import models

class Node(models.Model):
    TRANSFORM_CHOICES = [
        ('linear', 'Линейный'),
        ('quadratic', 'Квадратичный'),
        ('logarithmic', 'Логарифмический'),
        ('sinusoidal', 'Синусоидальный'),
        ('custom', 'Пользовательский'),
    ]
    name = models.CharField(max_length=100, default='Узел')
    color = models.CharField(max_length=7, default='#3498db')
    x = models.FloatField(default=100)
    y = models.FloatField(default=100)
    transform_type = models.CharField(max_length=20, choices=TRANSFORM_CHOICES, default='linear')
    transform_formula = models.TextField(blank=True, null=True, help_text='Формула для пользовательского типа (например, 2*x-4)')
    value = models.FloatField(default=0.0)

    def __str__(self):
        return self.name

class Edge(models.Model):
    source = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='outgoing_edges')
    target = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='incoming_edges')
    weight = models.FloatField(default=1.0)

    def __str__(self):
        return f"{self.source} -> {self.target}"
    
class Scenario(models.Model):
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    data = models.JSONField()  # хранит полный дамп графа
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name