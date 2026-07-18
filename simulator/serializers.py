from rest_framework import serializers
from .models import Node, Edge, Scenario

class NodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Node
        fields = ['id', 'name', 'color', 'x', 'y', 'value', 'transform_type', 'transform_formula']

class EdgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Edge
        fields = ['id', 'source', 'target', 'weight']

class ScenarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scenario
        fields = ['id', 'name', 'description', 'data', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']